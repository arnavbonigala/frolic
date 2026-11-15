import ConvexMobile
import Foundation
import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class CrewStore {
    private(set) var phase: ScreenPhase = .loading
    private(set) var view: CrewView?
    private(set) var isStandIn = false
    private(set) var actionError: String?
    var showsFreeSheet = false
    var friend: CrewRow?
    var showsInvite = false

    private var identity = CrewIdentity()
    private var client: ConvexClient?
    private var groupId: String?
    private var meWire: CrewMeWire?
    private var crewWire: CrewWire?
    private var todayWire: CrewTodayWire?
    private var tomorrowWire: CrewTodayWire?
    private var historyWire: [String: CrewTodayWire] = [:]
    private var fundWire: FundWire?
    private var online: Set<String> = []
    private var tasks: [Task<Void, Never>] = []
    private var started = false
    private var groupStarted = false
    private var lastError: String?
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
        guard route?.screen == "crew", route?.query["token"] != nil else { return }
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
        identity = CrewIdentity.resolve(route: router.e2eRoute)
        siteURL = ConvexConfig.siteURL
        guard let token = identity.deviceToken else {
            phase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        subscribeMe(client: client, token: token)
    }

    func retry(backend: FrolicBackend, router: AppRouter) {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        started = false
        groupStarted = false
        crewWire = nil
        todayWire = nil
        tomorrowWire = nil
        historyWire = [:]
        fundWire = nil
        view = nil
        lastError = nil
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
                        if let discovered = me?.groups.first?.groupId {
                            self.identity.adopt(groupId: discovered)
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
        guard let groupId = identity.groupId else {
            if !identity.hasToken {
                phase = .error(BackendError.notConfigured.localizedDescription)
            }
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

        subscribe("frolics:today", args: base.merging(["day": CrewDay.tomorrow()]) { _, new in new }) { [weak self] (tomorrow: CrewTodayWire) in
            self?.tomorrowWire = tomorrow
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
            self?.rebuild()
        }

        heartbeatLoop(client: client, token: token, groupId: groupId)
    }

    private func subscribe<T: Decodable>(_ name: String, args: [String: ConvexEncodable?], apply: @escaping @MainActor (T) -> Void) {
        guard let client else { return }
        tasks.append(
            Task { [weak self] in
                do {
                    for try await value in client.subscribe(to: name, with: args, yielding: T.self).values {
                        guard let self else { return }
                        apply(value)
                        self.lastError = nil
                        self.clearError()
                    }
                } catch {
                    self?.failClient(error)
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
        guard let client, let groupId, let token = identity.deviceToken else {
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
        switch option {
        case .tillEight:
            let window = ["start": nowMs, "end": CrewDay.todayAt(hour: 20)]
            args["state"] = "window"
            args["window"] = window as [String: ConvexEncodable?]
            optimistic = CrewFreeWire(state: "window", window: CrewWindow(start: nowMs, end: CrewDay.todayAt(hour: 20)), minutesAway: nil, updatedAt: nowMs)
        case .afterFive:
            let window = ["start": CrewDay.todayAt(hour: 17), "end": CrewDay.todayAt(hour: 20)]
            args["state"] = "window"
            args["window"] = window as [String: ConvexEncodable?]
            optimistic = CrewFreeWire(state: "window", window: CrewWindow(start: CrewDay.todayAt(hour: 17), end: CrewDay.todayAt(hour: 20)), minutesAway: nil, updatedAt: nowMs)
        case .notToday:
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
                holdEnabled: crew.holdEnabled
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
        guard let client, let groupId, let token = identity.deviceToken, let crew = crewWire else { return }
        actionError = nil
        let previous = crew
        crewWire = CrewWire(groupName: crew.groupName, members: crew.members, memberCount: crew.memberCount, createdAt: crew.createdAt, holdEnabled: enabled)
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
        guard let client, let groupId, let token = identity.deviceToken else { return nil }
        do {
            let code: String = try await client.mutation(
                "users:createInvite",
                with: ["deviceToken": token, "groupId": groupId]
            )
            return code.lowercased()
        } catch {
            actionError = Self.message(for: error)
            return nil
        }
    }

    private func failClient(_ error: Error) {
        let message = Self.message(for: error)
        if lastError == message { return }
        lastError = message
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
            if view == nil, lastError == nil { phase = .loading }
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
            } else {
                status = .free(CrewCopy.freeLine(member.free, now: now))
            }
            rows.append(
                CrewRow(
                    id: member.userId,
                    name: member.isMe ? "You" : member.name,
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
        if let frolic = tomorrowWire?.frolic, let plan = frolic.plan {
            let start = frolic.startsAt ?? plan.startsAt ?? 0
            let lead = "\(CrewCopy.weekday(frolic.day)) \(CrewCopy.hourWithMeridiem(start)):"
            var body = "\(plan.title)."
            let names = (tomorrowWire?.reveal?.going ?? []).map(\.name)
            if !names.isEmpty {
                body += " \(CrewCopy.names(names)) \(names.count == 1 ? "is" : "are") going."
            }
            comingUp = CrewComingUp(lead: lead, body: body, heroAsset: PlanPainted.hero(for: plan.title))
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
                title: "Bloomed at \(bloom.title)",
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

        view = CrewView(
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
            holdEnabled: crew.holdEnabled ?? false
        )
        phase = rows.count <= 1 ? .empty : .ready
    }
}

enum CrewFreeOption: String, CaseIterable, Identifiable {
    case tillEight
    case afterFive
    case notToday

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tillEight: "Free now till 8 PM"
        case .afterFive: "Free 5 PM to 8 PM"
        case .notToday: "Not today"
        }
    }

    var detail: String {
        switch self {
        case .tillEight: "From your calendar"
        case .afterFive: "Set by you, just for today"
        case .notToday: "No plan for you today. Nobody gets told."
        }
    }

    var identifier: String {
        switch self {
        case .tillEight: "free.sheet.till8"
        case .afterFive: "free.sheet.after5"
        case .notToday: "free.sheet.notToday"
        }
    }
}
