import Combine
import ConvexMobile
import CoreLocation
import Foundation
import UIKit

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
    var actionError: String?
    var clockOffset: Double = 0
    var step: CheckInStep = .onTheWay
    var snaps: [WireSnap] = []
    var myShot: UIImage?
    var myUserId: String?

    private(set) var frolicId: String?
    private let session = CheckInSession.shared
    private var client: ConvexClient?
    private var token: String?
    private var todayCancellable: AnyCancellable?
    private var etaCancellable: AnyCancellable?
    private var moneyCancellable: AnyCancellable?
    private var snapCancellable: AnyCancellable?
    private var ticker: Task<Void, Never>?
    private var watcher: ArrivalWatcher?

    init(frolicId: String?) {
        self.frolicId = frolicId
    }

    var plan: WirePlan? { today?.frolic?.plan }
    var place: WirePlace? { plan?.place }
    var reveal: WireReveal? { today?.reveal }
    var snapAt: Double? { reveal?.snapAt }

    var title: String { plan?.title ?? "" }
    var heroKey: String { plan?.heroKey ?? "plan-sunsets" }
    var kicker: String {
        guard let reveal else { return "It's on" }
        return "It's on · \(CheckInClock.time(reveal.startsAt))"
    }
    var placeName: String {
        let raw = place?.name ?? ""
        return raw.hasPrefix("the ") ? "The" + raw.dropFirst(3) : raw
    }
    var others: [WirePerson] { reveal?.going.filter { $0.userId != myUserId } ?? [] }
    var otherNames: String { FrolicNames.list(others.map(\.name)) }
    var myPerson: WirePerson? { reveal?.going.first { $0.userId == myUserId } }

    var sharedNote: String {
        others.isEmpty ? "Shared only until you arrive." : "Shared only with \(otherNames), and only until you arrive."
    }

    var lockTitle: String { "\(placeName) at \(CheckInClock.time(reveal?.startsAt ?? 0))" }

    var lockLine: String {
        let lines = others.prefix(2).compactMap { person -> String? in
            guard let row = eta(for: person) else { return nil }
            if isHere(row) { return "\(person.name)'s there." }
            return "\(person.name) is \(Int(row.minutes)) min out."
        }
        return lines.isEmpty ? "Your crew is on the way." : lines.joined(separator: " ")
    }

    var leaveBy: String? {
        guard let startsAt = reveal?.startsAt, let myMinutes, !checkedIn else { return nil }
        let leave = startsAt - Double(myMinutes) * 60000
        guard leave > Date().timeIntervalSince1970 * 1000 + clockOffset else { return nil }
        return "Leave by \(CheckInClock.time(leave))"
    }

    var canShowArrival: Bool {
        money.state == "returned" || money.state == "returning"
    }

    func eta(for person: WirePerson) -> WireEta? {
        etas.first { $0.userId == person.userId }
    }

    private func isHere(_ row: WireEta) -> Bool {
        !row.onTheWay || row.minutes <= 0
    }

    func isMe(_ person: WirePerson) -> Bool {
        person.userId == myUserId
    }

    func rowStatus(for person: WirePerson) -> String {
        if isMe(person) {
            if checkedIn { return "Here" }
            return myMinutes.map { $0 <= 0 ? "Here" : "\($0) min away" } ?? "On the way"
        }
        guard let row = eta(for: person) else { return "On the way" }
        return isHere(row) ? "Here" : "\(Int(row.minutes)) min away"
    }

    func rowProgress(for person: WirePerson) -> Double {
        if isMe(person) {
            if checkedIn { return 1 }
            return myMinutes.map(RouteService.progress(for:)) ?? 0.08
        }
        guard let row = eta(for: person) else { return 0.08 }
        return isHere(row) ? 1 : RouteService.progress(for: Int(row.minutes))
    }

    func attach(watcher: ArrivalWatcher) {
        self.watcher = watcher
    }

    func load(backend: FrolicBackend) async {
        guard let client = backend.client else {
            phase = .error(CheckInFailure.noServer.localizedDescription)
            return
        }
        self.client = client
        phase = .loading
        do {
            let token = try session.requireToken()
            self.token = token
            async let offset = measureOffset(client: client)
            let me = try await session.me(client: client, token: token)
            guard let me else { throw CheckInFailure.noIdentity }
            guard let groupId = session.groupOverride ?? me.groups.first?.groupId else { throw CheckInFailure.noCrew }
            myUserId = me.userId
            subscribeToday(client: client, token: token, groupId: groupId)
            clockOffset = await offset
            startTicker()
        } catch {
            phase = .error(checkInMessage(error))
        }
    }

    private func measureOffset(client: ConvexClient) async -> Double {
        var best: (rtt: Double, offset: Double)?
        for _ in 0..<3 {
            let t0 = Date().timeIntervalSince1970 * 1000
            guard let server: Double = try? await client.mutation("clock:now", with: [:]) else { continue }
            let t1 = Date().timeIntervalSince1970 * 1000
            let sample = (rtt: t1 - t0, offset: server - (t0 + t1) / 2)
            if best == nil || sample.rtt < best!.rtt { best = sample }
        }
        return best?.offset ?? 0
    }

    private func subscribeToday(client: ConvexClient, token: String, groupId: String) {
        var args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
        if let frolicId { args["frolicId"] = frolicId }
        todayCancellable = client
            .subscribe(to: "frolics:today", with: args, yielding: WireToday.self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    MainActor.assumeIsolated {
                        guard let self, case .failure(let error) = completion, self.today == nil else { return }
                        self.phase = .error(checkInMessage(error))
                    }
                },
                receiveValue: { [weak self] value in
                    MainActor.assumeIsolated { self?.apply(value) }
                }
            )
    }

    private func subscribeFrolic(_ id: String) {
        guard let client, let token else { return }
        let args: [String: ConvexEncodable?] = ["deviceToken": token, "frolicId": id]
        etaCancellable = client
            .subscribe(to: "etas:forFrolic", with: args, yielding: [WireEta].self)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] rows in
                MainActor.assumeIsolated { self?.etas = rows }
            })
        moneyCancellable = client
            .subscribe(to: "whop/pay:myPayment", with: args, yielding: WireMoney.self)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] value in
                MainActor.assumeIsolated { self?.money = value }
            })
        snapCancellable = client
            .subscribe(to: "snaps:forFrolic", with: args, yielding: [WireSnap].self)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] rows in
                MainActor.assumeIsolated { self?.snaps = rows }
            })
    }

    private func apply(_ value: WireToday) {
        today = value
        if let id = value.frolic?.frolicId, id != frolicId || etaCancellable == nil {
            frolicId = id
            subscribeFrolic(id)
            Task { await refreshRoute() }
        }
        guard value.frolic != nil, value.phase == "on", value.reveal?.me.going == true else {
            phase = .empty
            return
        }
        phase = .ready
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                await self?.refreshRoute()
            }
        }
    }

    func refreshRoute() async {
        guard let client, let token, let frolicId, let place, let watcher, !checkedIn else { return }
        watcher.refresh()
        guard let coordinate = watcher.currentCoordinate else { return }
        guard let minutes = await RouteService.walkingMinutes(from: coordinate, to: place) else { return }
        myMinutes = watcher.arrived ? 0 : minutes
        let _: String? = try? await client.mutation(
            "etas:setMine",
            with: ["deviceToken": token, "frolicId": frolicId, "minutes": myMinutes ?? minutes, "onTheWay": !watcher.arrived]
        )
    }

    func checkIn(method: String) {
        guard let client, let token, let frolicId, !checkedIn else { return }
        actionError = nil
        checkedIn = true
        myMinutes = 0
        step = .snap
        Task {
            do {
                let _: String = try await client.mutation(
                    "checkins:checkInMe",
                    with: ["deviceToken": token, "frolicId": frolicId, "method": method]
                )
                let _: String? = try? await client.mutation(
                    "etas:setMine",
                    with: ["deviceToken": token, "frolicId": frolicId, "minutes": 0, "onTheWay": false]
                )
            } catch {
                checkedIn = false
                step = .onTheWay
                actionError = checkInMessage(error)
            }
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

    func noteSnapTaken(_ image: UIImage) {
        myShot = image
        step = .collage
    }

    var credentials: (ConvexClient, String, String)? {
        guard let client, let token, let frolicId else { return nil }
        return (client, token, frolicId)
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
