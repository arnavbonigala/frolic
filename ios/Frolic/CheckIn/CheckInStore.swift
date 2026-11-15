import Combine
import ConvexMobile
import CoreLocation
import Foundation

enum CheckInStep: Equatable {
    case onTheWay
    case snap
    case collage
}

@MainActor
@Observable
final class CheckInStore {
    var phase: ScreenPhase = .loading
    var today: WireToday?
    var etas: [WireEta] = []
    var money: WireMoney = .none
    var myMinutes: Int?
    var checkedIn = false
    var isCheckingIn = false
    var actionError: String?
    var clockOffset: Double = 0
    var step: CheckInStep = .onTheWay
    var snapAt: Double?
    var snapFailed = false
    var snaps: [WireSnap] = []
    var myShot: UIImage?

    let frolicId: String?
    private let session = CheckInSession.shared
    private var client: ConvexClient?
    private var token: String?
    private var groupId: String?
    private var todayCancellable: AnyCancellable?
    private var etaCancellable: AnyCancellable?
    private var moneyCancellable: AnyCancellable?
    private var snapCancellable: AnyCancellable?
    private var ticker: Task<Void, Never>?
    private var watcher: ArrivalWatcher?

    init(frolicId: String?) {
        self.frolicId = frolicId
    }

    var frolic: WireFrolic? { today?.frolic }
    var plan: WirePlan? { today?.frolic?.plan }
    var place: WirePlace? { today?.frolic?.plan?.place }
    var reveal: WireReveal? { today?.reveal }

    var title: String { plan?.title ?? "Today's frolic" }
    var kicker: String {
        guard let reveal else { return "It's on" }
        return "It's on · \(CheckInClock.time(reveal.startsAt))"
    }
    var placeName: String {
        let raw = place?.name ?? "the spot"
        return raw.hasPrefix("the ") ? "The" + raw.dropFirst(3) : raw
    }
    var others: [WirePerson] { reveal?.going.filter { !isMe($0) } ?? [] }
    var otherNames: String { FrolicNames.list(others.map(\.name)) }
    var myPerson: WirePerson? { reveal?.going.first(where: isMe) }

    var sharedNote: String {
        others.isEmpty ? "Your crew can see you're on your way." : "Shared only with \(otherNames), and only until you arrive."
    }

    var lockTitle: String { "\(placeName) at \(CheckInClock.time(reveal?.startsAt ?? 0))" }

    var lockLine: String {
        guard let first = others.first else { return "You're on your way." }
        var parts = ["\(first.name)'s there."]
        if others.count > 1, let second = others.dropFirst().first {
            let minutes = minutes(for: second.userId)
            parts.append("\(second.name) is \(minutesLabel(minutes)) out.")
        }
        return parts.joined(separator: " ")
    }

    var leaveBy: String? {
        guard let startsAt = reveal?.startsAt, let myMinutes else { return nil }
        return "Leave by \(CheckInClock.time(startsAt - Double(myMinutes) * 60000))"
    }

    var canShowArrival: Bool {
        money.state == "returned" || money.state == "returning"
    }

    func minutes(for userId: String) -> Int {
        Int(etas.first { $0.userId == userId }?.minutes ?? 0)
    }

    func minutesLabel(_ minutes: Int) -> String {
        minutes <= 0 ? "here" : "\(minutes) min"
    }

    func rowStatus(for person: WirePerson) -> String {
        if isMe(person) {
            return myMinutes.map { $0 <= 0 ? "Here" : "\($0) min away" } ?? "On the way"
        }
        let row = etas.first { $0.userId == person.userId }
        guard let row else { return person.id == others.first?.id ? "Here" : "On the way" }
        if !row.onTheWay || row.minutes <= 0 { return "Here" }
        return "\(Int(row.minutes)) min away"
    }

    func rowProgress(for person: WirePerson) -> Double {
        if isMe(person) {
            return RouteService.angle(for: myMinutes ?? 12)
        }
        let row = etas.first { $0.userId == person.userId }
        guard let row, row.onTheWay else { return 1 }
        return RouteService.angle(for: Int(row.minutes))
    }

    func isMe(_ person: WirePerson) -> Bool {
        if let myId = sessionMyId { return person.userId == myId }
        return false
    }

    private var sessionMyId: String?

    func attach(watcher: ArrivalWatcher) {
        self.watcher = watcher
    }

    func load(backend: FrolicBackend) async {
        guard let client = backend.client else {
            phase = .error(CheckInFailure.noServer.localizedDescription)
            return
        }
        self.client = client
        do {
            let token = try session.requireToken()
            self.token = token
            guard let me = try await session.me(client: client, token: token),
                  let groupId = me.groups.first?.groupId
            else { throw CheckInFailure.noCrew }
            self.groupId = groupId
            sessionMyId = me.userId
            let now: Double = try await client.mutation("clock:now", with: [:])
            clockOffset = now - Date().timeIntervalSince1970 * 1000
            subscribe(client: client, token: token, groupId: groupId)
            startTicker()
        } catch {
            phase = .error(checkInMessage(error))
        }
    }

    private func subscribe(client: ConvexClient, token: String, groupId: String) {
        var args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
        if let frolicId { args["frolicId"] = frolicId }
        todayCancellable = client
            .subscribe(to: "frolics:today", with: args, yielding: WireToday.self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    Task { @MainActor in
                        guard let self else { return }
                        if case .failure(let error) = completion, self.today == nil {
                            self.phase = .error(checkInMessage(error))
                        }
                    }
                },
                receiveValue: { [weak self] value in
                    Task { @MainActor in self?.apply(value) }
                }
            )
        guard let frolicId else { return }
        etaCancellable = client
            .subscribe(to: "etas:forFrolic", with: ["deviceToken": token, "frolicId": frolicId], yielding: [WireEta].self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] rows in
                    Task { @MainActor in self?.etas = rows }
                }
            )
        moneyCancellable = client
            .subscribe(to: "whop:pay:myPayment", with: ["deviceToken": token, "frolicId": frolicId], yielding: WireMoney.self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] value in
                    Task { @MainActor in self?.money = value }
                }
            )
    }

    private func apply(_ value: WireToday) {
        today = value
        if value.frolic == nil {
            phase = .empty
            return
        }
        if value.phase == "on" {
            if let reveal = value.reveal, reveal.snapAt != nil {
                snapAt = reveal.snapAt
            }
            phase = .ready
        } else if value.phase == "done" {
            phase = .empty
        } else {
            phase = .empty
        }
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshRoute()
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
    }

    func refreshRoute() async {
        guard let client, let token, let frolicId, let place, let watcher else { return }
        let coordinate: CLLocationCoordinate2D?
        if let simulationCoordinate = watcher.simulatedCoordinate {
            coordinate = simulationCoordinate
        } else {
            coordinate = watcher.lastCoordinate
        }
        guard let coordinate else { return }
        let minutes = await RouteService.walkingMinutes(from: coordinate, to: place)
        guard let minutes else { return }
        myMinutes = minutes
        let _: String? = try? await client.mutation(
            "etas:setMine",
            with: ["deviceToken": token, "frolicId": frolicId, "minutes": minutes, "onTheWay": !watcher.arrived]
        )
    }

    func checkIn(method: String) async {
        guard let client, let token, let frolicId else { return }
        isCheckingIn = true
        actionError = nil
        defer { isCheckingIn = false }
        do {
            let id: String = try await client.mutation(
                "checkins:checkInMe",
                with: ["deviceToken": token, "frolicId": frolicId, "method": method]
            )
            checkedIn = !id.isEmpty
            step = .snap
        } catch {
            actionError = checkInMessage(error)
        }
    }

    func bail() async -> Bool {
        guard let client, let token, let frolicId else { return false }
        do {
            let _: String? = try await client.mutation("frolics:sitOut", with: ["deviceToken": token, "frolicId": frolicId])
            return true
        } catch {
            actionError = checkInMessage(error)
            return false
        }
    }

    func noteSnapTaken(_ image: UIImage, frolicId: String) {
        myShot = image
        snapFailed = false
        step = .collage
        Task { await loadSnaps(frolicId: frolicId) }
    }

    func loadSnaps(frolicId: String) async {
        guard let client, let token else { return }
        snapCancellable = client
            .subscribe(to: "snaps:forFrolic", with: ["deviceToken": token, "frolicId": frolicId], yielding: [WireSnap].self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] rows in
                    Task { @MainActor in self?.snaps = rows }
                }
            )
    }

    func stop() {
        ticker?.cancel()
        todayCancellable?.cancel()
        etaCancellable?.cancel()
        moneyCancellable?.cancel()
        snapCancellable?.cancel()
    }
}

enum FrolicNames {
    static func list(_ names: [String]) -> String {
        switch names.count {
        case 0: return ""
        case 1: return names[0]
        case 2: return "\(names[0]) and \(names[1])"
        default:
            return names.dropLast().joined(separator: ", ") + " and " + (names.last ?? "")
        }
    }
}
