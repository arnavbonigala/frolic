import ConvexMobile
import Foundation
import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class CrewStore {
    private(set) var phase: ScreenPhase = .loading
    private(set) var view: CrewScene?
    private(set) var isStandIn = false
    private(set) var actionError: String?
    var showsFreeSheet = false
    var friend: CrewRow?
    var showsInvite = false

    private var client: ConvexClient?
    private var groupId: String?
    private var meWire: CrewMeWire?
    private var crewWire: CrewWire?
    private var todayWire: CrewTodayWire?
    private var tomorrowPlan: CrewPlanViewWire?
    private var historyWire: [String: CrewTodayWire] = [:]
    private var fundWire: FundWire?
    private var online: Set<String> = []
    private var tasks: [Task<Void, Never>] = []
    private var started = false
    private var groupStarted = false
    private var lastError: String?
    private var hasFailed = false
    private(set) var fundLoaded = false
    private(set) var inviteError: String?
    private var siteURL: String?

    private static let historyDays = 7
    private static let sessionId = UUID().uuidString

    func routeChanged(router: AppRouter, backend: FrolicBackend) {
        let route = router.e2eRoute
        if let standInView = CrewStandIn.view(route: route) {
            tasks.forEach { $0.cancel() }
            tasks.removeAll()
            started = true
            isStandIn = true
            view = standInView
            phase = .ready
            return
        }
        guard isStandIn || route?.query["token"] != nil || route?.query["deviceToken"] != nil else { return }
        isStandIn = false
        retry(backend: backend, router: router)
    }

    func start(router: AppRouter, backend: FrolicBackend) {
        guard !started else { return }
        started = true
        if let standInView = CrewStandIn.view(route: router.e2eRoute) {
            isStandIn = true
            view = standInView
            phase = .ready
            return
        }
        guard let client = backend.client else {
            phase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        self.client = client
        siteURL = ConvexConfig.siteURL
        FrolicIdentity.shared.refresh()
        subscribeMe(client: client, token: FrolicIdentity.shared.deviceToken)
    }

    func retry(backend: FrolicBackend, router: AppRouter) {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        started = false
        groupStarted = false
        crewWire = nil
        todayWire = nil
        tomorrowPlan = nil
        historyWire = [:]
        fundWire = nil
        view = nil
        lastError = nil
        hasFailed = false
        fundLoaded = false
        isStandIn = false
        phase = .loading
        start(router: router, backend: backend)
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
    }

    private func subscribeMe(client: ConvexClient, token: String) {
        tasks.append(
            Task { [weak self] in
                do {
                    let stream = client.subscribe(to: "users:me", with: ["deviceToken": token], yielding: CrewMeWire?.self).values
                    for try await me in stream {
                        guard let self else { return }
                        self.meWire = me
                        if FrolicIdentity.shared.groupId == nil, let discovered = me?.groups.first?.groupId {
                            FrolicIdentity.shared.setGroup(discovered)
                        }
                        self.startGroup(client: client, token: token)
                    }
                } catch {
                    self?.failClient(error)
                }
            }
        )
    }

    private func startGroup(client: ConvexClient, token: String) {
        guard !groupStarted else { return }
        guard let groupId = FrolicIdentity.shared.groupId else {
            phase = .empty
            return
        }
        groupStarted = true
        self.groupId = groupId
        let base: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]

        subscribe("crew:crew", args: base.merging(["day": CrewDay.today()]) { _, new in new }) { [weak self] (crew: CrewWire) in
            self?.crewWire = crew
            self?.rebuild()
        }

        subscribe("frolics:today", args: base) { [weak self] (today: CrewTodayWire) in
            self?.todayWire = today
            self?.rebuild()
        }

        subscribe("plans:today", args: ["token": token, "groupId": groupId, "day": CrewDay.tomorrow()]) { [weak self] (plan: CrewPlanViewWire?) in
            self?.tomorrowPlan = plan
            self?.rebuild()
        }

        for offset in 1...Self.historyDays {
            let day = CrewDay.today(-offset)
            subscribe("frolics:today", args: base.merging(["day": day]) { _, new in new }) { [weak self] (past: CrewTodayWire) in
                self?.historyWire[day] = past
                self?.rebuild()
            }
        }

        subscribe("whop/pay:fund", args: base) { [weak self] (fund: FundWire) in
            self?.fundWire = fund
            self?.fundLoaded = true
            self?.rebuild()
        }

        heartbeatLoop(client: client, token: token, groupId: groupId)
    }

    private func subscribe<T: Decodable>(_ name: String, args: [String: ConvexEncodable?], apply: @escaping @MainActor (T) -> Void) {
        guard let client else { return }
        tasks.append(
            Task { [weak self] in
                while !Task.isCancelled {
                    do {
                        for try await value in client.subscribe(to: name, with: args, yielding: T.self).values {
                            guard let self else { return }
                            apply(value)
                            if name == "crew:crew" {
                                self.hasFailed = false
                                self.lastError = nil
                                self.clearError()
                            }
                        }
                    } catch {
                        self?.failClient(error)
                    }
                    try? await Task.sleep(for: .seconds(3))
                }
            }
        )
    }

    private func heartbeatLoop(client: ConvexClient, token: String, groupId: String) {
        tasks.append(
            Task { [weak self] in
                var roomToken: String?
                while !Task.isCancelled {
                    do {
                        let beat: HeartbeatWire = try await client.mutation(
                            "crew:heartbeat",
                            with: [
                                "deviceToken": token,
                                "groupId": groupId,
                                "sessionId": Self.sessionId,
                                "interval": 15000,
                            ]
                        )
                        if roomToken != beat.roomToken {
                            roomToken = beat.roomToken
                            self?.subscribeLooking(client: client, roomToken: beat.roomToken)
                        }
                    } catch {
                        self?.failClient(error)
                    }
                    try? await Task.sleep(for: .seconds(15))
                }
            }
        )
    }

    private func subscribeLooking(client: ConvexClient, roomToken: String) {
        tasks.append(
            Task { [weak self] in
                do {
                    let stream = client.subscribe(to: "crew:looking", with: ["roomToken": roomToken], yielding: [LookingWire].self).values
                    for try await people in stream {
                        guard let self else { return }
                        self.online = Set(people.filter(\.online).map(\.userId))
                        self.rebuild()
                    }
                } catch {
                    self?.failClient(error)
                }
            }
        )
    }

    func setFree(_ option: CrewFreeOption) async {
        guard let client, let groupId, case let token = FrolicIdentity.shared.deviceToken else {
            if isStandIn { showsFreeSheet = false }
            return
        }
        actionError = nil
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let nowMs = Date().timeIntervalSince1970 * 1000
        var args: [String: ConvexEncodable?] = [
            "deviceToken": token,
            "groupId": groupId,
            "day": CrewDay.today(),
        ]
        var optimistic: CrewFreeWire
        switch option.kind {
        case .window(let start, let end):
            args["state"] = "window"
            args["window"] = ["start": start, "end": end] as [String: ConvexEncodable?]
            optimistic = CrewFreeWire(state: "window", window: CrewWindow(start: start, end: end), minutesAway: nil, updatedAt: nowMs)
        case .busy:
            args["state"] = "busy"
            optimistic = CrewFreeWire(state: "busy", window: nil, minutesAway: nil, updatedAt: nowMs)
        }
        let previous = crewWire
        if let crew = crewWire {
            crewWire = CrewWire(
                groupName: crew.groupName,
                members: crew.members.map { $0.isMe ? $0.with(free: optimistic) : $0 },
                memberCount: crew.memberCount,
                createdAt: crew.createdAt,
                holdEnabled: crew.holdEnabled,
                holdCents: crew.holdCents
            )
            rebuild()
        }
        showsFreeSheet = false
        do {
            try await client.mutation("crew:setFree", with: args)
        } catch {
            crewWire = previous
            rebuild()
            actionError = Self.message(for: error)
            showsFreeSheet = true
        }
    }

    func setHold(_ enabled: Bool) async {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if isStandIn {
            view?.holdEnabled = enabled
            return
        }
        guard let client, let groupId, case let token = FrolicIdentity.shared.deviceToken, let crew = crewWire else { return }
        actionError = nil
        let previous = crew
        crewWire = CrewWire(groupName: crew.groupName, members: crew.members, memberCount: crew.memberCount, createdAt: crew.createdAt, holdEnabled: enabled, holdCents: crew.holdCents)
        rebuild()
        do {
            try await client.mutation("crew:setHold", with: ["deviceToken": token, "groupId": groupId, "enabled": enabled])
        } catch {
            crewWire = previous
            rebuild()
            actionError = Self.message(for: error)
        }
    }

    func inviteCode() async -> String? {
        guard let client, let groupId, case let token = FrolicIdentity.shared.deviceToken else { return nil }
        do {
            inviteError = nil
            let code: String = try await client.mutation(
                "users:createInvite",
                with: ["deviceToken": token, "groupId": groupId]
            )
            return code.lowercased()
        } catch {
            inviteError = Self.message(for: error)
            return nil
        }
    }

    private func failClient(_ error: Error) {
        let message = Self.message(for: error)
        if lastError == message { return }
        lastError = message
        hasFailed = true
        if view == nil { phase = .error(message) }
    }

    private func clearError() {
        if view != nil, case .error = phase {
            phase = .ready
        }
    }

    private static func message(for error: Error) -> String {
        guard let clientError = error as? ClientError else {
            return "Couldn't reach Frolic. Check your connection and try again."
        }
        switch clientError {
        case .ConvexError(let data):
            if let parsed = try? JSONDecoder().decode([String: String].self, from: Data(data.utf8)),
               let text = parsed["message"] {
                return text
            }
            return "Something went wrong. Try again in a moment."
        case .ServerError(let text):
            return text.isEmpty ? "Something went wrong. Try again in a moment." : text
        default:
            return "Couldn't reach Frolic. Check your connection and try again."
        }
    }

    private func absolutePhoto(_ raw: String?) -> String? {
        guard let raw, let siteURL, let url = URL(string: raw), url.path.hasPrefix("/p/") else { return raw }
        return siteURL + url.path
    }

    private func rebuild() {
        guard let crew = crewWire else {
            if view == nil, !hasFailed { phase = .loading }
            return
        }
        let now = Date().timeIntervalSince1970 * 1000
        let memberCount = Int(crew.memberCount ?? Double(crew.members.count))
        let createdAt = crew.createdAt
        let subtitle = createdAt.map { "\(memberCount) of you · the crew started in \(CrewCopy.month($0))" }
            ?? "\(memberCount) of you"

        let todayDone = todayWire?.phase == "done"
        let goingPeople = todayWire?.reveal?.going ?? []
        let going = Set(goingPeople.map(\.userId))
        let iWent = todayWire?.reveal?.me?.going == true
        let todayTitle = todayWire?.frolic?.plan?.title

        var rows: [CrewRow] = []
        for member in crew.members {
            let status: CrewRow.Status
            if todayDone && going.contains(member.userId) {
                status = member.isMe ? .went : (iWent ? .wentWithYou : .went)
            } else if member.free?.state == "busy" {
                status = .busy
            } else if member.free == nil {
                status = .notSaid
            } else {
                status = .free(CrewCopy.freeLine(member.free, now: now))
            }
            rows.append(
                CrewRow(
                    id: member.userId,
                    name: member.name,
                    color: member.flowerColor,
                    photoURL: absolutePhoto(member.photoUrl),
                    photoAsset: nil,
                    isMe: member.isMe,
                    status: status,
                    minutesAway: member.free?.minutesAway.map { Int($0) },
                    lookingNow: online.contains(member.userId)
                )
            )
        }
        guard let me = rows.first(where: \.isMe) ?? rows.first else {
            phase = .empty
            return
        }
        let friends = rows.filter { $0.id != me.id }
        let nobodyFree = !friends.isEmpty && friends.allSatisfy { !$0.isFree }

        var comingUp: CrewComingUp?
        if let plan = tomorrowPlan {
            let when = CrewCopy.hourWithMeridiem(plan.startsAt)
            comingUp = CrewComingUp(
                lead: "\(CrewCopy.weekday(CrewDay.tomorrow())) \(when):",
                body: "\(plan.title).",
                heroAsset: plan.heroKey
            )
        }

        var blooms: [(day: String, title: String, names: [String], colors: [FlowerColor], wentWithMe: Bool)] = []
        if todayDone, let title = todayTitle {
            let people = todayWire?.reveal?.going ?? []
            blooms.append(
                (day: CrewDay.today(), title: title, names: people.map(\.name),
                 colors: people.map(\.flowerColor), wentWithMe: iWent)
            )
        }
        for (day, wire) in historyWire {
            guard wire.phase == "done", let title = wire.frolic?.plan?.title else { continue }
            let people = wire.reveal?.going ?? []
            blooms.append(
                (day: day, title: title, names: people.map(\.name),
                 colors: people.map(\.flowerColor), wentWithMe: wire.reveal?.me?.going == true)
            )
        }
        blooms.sort { $0.day > $1.day }
        let lately = blooms.prefix(3).map { bloom in
            CrewLatelyRow(
                id: bloom.day + bloom.title,
                title: bloom.title,
                names: CrewCopy.names(bloom.names),
                day: CrewCopy.shortDay(bloom.day),
                colors: bloom.colors
            )
        }

        var tally: [String: (count: Int, went: Bool)] = [:]
        for bloom in blooms {
            var entry = tally[bloom.title] ?? (0, false)
            entry.count += 1
            entry.went = entry.went || bloom.wentWithMe
            tally[bloom.title] = entry
        }
        let favorites = tally.sorted { left, right in
            if left.value.count != right.value.count { return left.value.count > right.value.count }
            return left.key < right.key
        }
        .prefix(3)
        .map { item in
            CrewFavoriteRow(
                id: item.key,
                title: item.value.went ? "\(item.key) (you went)" : item.key,
                count: item.value.count == 1 ? "1 time" : "\(item.value.count) times"
            )
        }

        let fundRows = (fundWire?.entries ?? []).map { entry in
            CrewFundRow(
                id: entry.id,
                text: entry.line,
                day: CrewCopy.shortDay(CrewDay.format(Date(timeIntervalSince1970: entry.at / 1000))),
                kind: entry.amountCents < 0 ? .covered : (entry.line.contains("went back") ? .returned : .added)
            )
        }
        let fund = CrewFund(balanceCents: Int(fundWire?.balanceCents ?? 0), rows: fundRows)

        view = CrewScene(
            groupName: crew.groupName,
            subtitle: subtitle,
            me: me,
            rows: friends,
            nobodyFree: nobodyFree,
            comingUp: comingUp,
            lately: lately,
            favorites: favorites,
            fund: fund,
            wentToday: iWent && todayDone,
            todayTitle: todayTitle,
            holdEnabled: crew.holdEnabled ?? false,
            fundLoaded: fundLoaded,
            holdCents: Int(crew.holdCents ?? 300)
        )
        phase = rows.count <= 1 ? .empty : .ready
    }
}

struct CrewFreeOption: Identifiable, Equatable {
    enum Kind: Equatable {
        case window(start: Double, end: Double)
        case busy
    }

    var id: String
    var title: String
    var kind: Kind
    var identifier: String

    static func options(now: Date = Date()) -> [CrewFreeOption] {
        let calendar = CrewDay.calendar
        let nowMs = now.timeIntervalSince1970 * 1000
        let hourMs = 3_600_000.0
        let nextHour = (calendar.nextDate(after: now, matching: DateComponents(minute: 0, second: 0), matchingPolicy: .nextTime)?.timeIntervalSince1970 ?? now.timeIntervalSince1970 + 3600) * 1000
        let endNow = nextHour + 2 * hourMs
        let laterStart = nextHour + 2 * hourMs
        let laterEnd = laterStart + 3 * hourMs
        return [
            CrewFreeOption(id: "now", title: "Free till \(CrewCopy.hourWithMeridiem(endNow))", kind: .window(start: nowMs, end: endNow), identifier: "free.sheet.till8"),
            CrewFreeOption(id: "later", title: "Free \(CrewCopy.hourWithMeridiem(laterStart)) to \(CrewCopy.hourWithMeridiem(laterEnd))", kind: .window(start: laterStart, end: laterEnd), identifier: "free.sheet.after5"),
            CrewFreeOption(id: "busy", title: "Not today", kind: .busy, identifier: "free.sheet.notToday"),
        ]
    }
}
