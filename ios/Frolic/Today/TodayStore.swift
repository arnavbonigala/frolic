import ConvexMobile
import Foundation
import Observation
import UIKit
import UserNotifications

enum TodayScene: Equatable {
    case none
    case solo(waiting: Bool)
    case off
    case open
    case waiting(onlyIf: [String])
    case on
    case hopIn
    case faded
    case done
}

enum PendingTap: Equatable {
    case down([TodayPerson])
    case takeBack
    case hopIn
    case sitOut
}

@MainActor
@Observable
final class TodayStore {
    enum Sheet: String, Identifiable, Hashable {
        case onlyIf
        case share
        case bail
        case hold
        case free
        case imFree

        var id: String { rawValue }
    }

    private(set) var load: ScreenPhase = .loading
    private(set) var today: TodayView?
    private(set) var crew: CrewView?
    private(set) var payment: TodayPayment?
    private(set) var offset: Double = 0
    private(set) var bloomed = false
    private(set) var bloomID = 0
    private(set) var notice: String?
    private(set) var payPage: TodayWebPage?
    private(set) var shareItem: TodayShareItem?
    private(set) var shareBusy = false
    private(set) var payBusy = false
    private(set) var pending: PendingTap?
    private(set) var pendingFree: CrewFree?
    private(set) var isFixture = false
    private(set) var startingPlan = false
    private(set) var startError: String?
    private(set) var drop: TodayDrop?
    private(set) var tomorrow: TodayView?
    private(set) var gardenHealth: TodayGardenHealth?
    private(set) var onThisDay: TodayOnThisDay?
    var walkFrom: (Double, Double)?
    var hintSeen = AppGroup.defaults.bool(forKey: "today.hint.down")

    var sheet: Sheet?
    var picks: Set<String> = []

    private let identity = FrolicIdentity.shared
    private var client: ConvexClient?
    private var tasks: [Task<Void, Never>] = []
    private var bloomTask: Task<Void, Never>?
    private var noticeTask: Task<Void, Never>?
    private var paymentFrolic: String?
    private var bloomedFrolic: String?
    private var routeKey: String?
    private var dropFrolic: String?

    func now() -> Double {
        Date().timeIntervalSince1970 * 1000 + offset
    }

    var frolic: TodayFrolic? { today?.frolic }
    var plan: TodayPlan? { today?.frolic?.plan }
    var reveal: TodayReveal? { today?.reveal }
    var meMember: CrewMember? { crew?.me }
    var visiblePayment: TodayPayment? {
        guard let payment else { return nil }
        if payment.kind == "hold" && crew?.holdEnabled != true { return nil }
        return payment
    }
    var myFree: CrewFree? { pendingFree ?? meMember?.free }
    var friends: [CrewMember] { (crew?.members ?? []).filter { !$0.isMe } }
    var freeFriends: [TodayPerson] {
        friends.filter { $0.free?.state == "now" || $0.free?.state == "window" }.map(Self.person)
    }

    var allFriends: [TodayPerson] { friends.map(Self.person) }

    var mePerson: TodayPerson {
        TodayPerson(
            userId: meMember?.userId ?? "me",
            name: "You",
            color: meMember?.color ?? "tomato",
            photoUrl: meMember?.photoUrl ?? reveal?.going.first { $0.userId == meMember?.userId }?.photoUrl,
            role: nil
        )
    }

    var goingPeople: [TodayPerson] {
        guard let reveal else { return [] }
        var going = reveal.going.filter { $0.userId != meMember?.userId }
        let iAmGoing = reveal.me.going || pending == .hopIn
        if iAmGoing && pending != .sitOut {
            going.insert(mePerson, at: 0)
        }
        return going
    }

    var goingFriendNames: [String] {
        goingPeople.filter { $0.userId != mePerson.userId }.map(\.name)
    }

    var notGoingNames: [String] {
        let ids = Set(goingPeople.map(\.userId))
        return friends.filter { !ids.contains($0.userId) }.map(\.name)
    }

    var iAmGoing: Bool {
        guard let reveal else { return false }
        if pending == .sitOut { return false }
        return reveal.me.going || pending == .hopIn
    }

    var tapOnlyIf: [TodayPerson] {
        if case .down(let list) = pending { return list }
        return today?.myTap?.onlyIf ?? []
    }

    var isDown: Bool {
        if case .down = pending { return true }
        if pending == .takeBack { return false }
        return today?.myTap?.kind == "down"
    }

    var scene: TodayScene {
        guard let today else { return .none }
        let solo = today.memberCount <= 1
        var phase = today.phase
        if phase == .on && !bloomed {
            phase = isDown ? .waiting : .open
        }
        switch phase {
        case .none:
            return myFree?.state == "busy" ? .off : .none
        case .solo, .open, .waiting:
            if today.frolic != nil && today.frolic?.plan == nil { return .none }
            if today.myTap?.kind == "notToday" || (myFree?.state == "busy" && !isDown) { return .off }
            if solo { return .solo(waiting: isDown) }
            return isDown ? .waiting(onlyIf: tapOnlyIf.map(\.name)) : .open
        case .on:
            return iAmGoing ? .on : .hopIn
        case .faded:
            return .faded
        case .done:
            return reveal?.me.going == true ? .done : .faded
        }
    }

    func start(backend: FrolicBackend, route: E2ERoute?) {
        let newKey = key(for: route)
        guard newKey != routeKey else { return }
        routeKey = newKey
        stop()
        #if DEBUG || E2E
        if let route, route.screen == "today", route.query["fixture"] == "1", let fixture = TodayFixture(route: route) {
            isFixture = true
            applyFixture(fixture, route: route)
            return
        }
        #endif
        isFixture = false
        guard let client = backend.client else {
            load = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        self.client = client
        if let token = route?.query["token"] {
            identity.signIn(deviceToken: token, groupId: route?.query["group"])
        }
        if today == nil { load = .loading }
        tasks.append(Task { [weak self] in await self?.measureOffset() })
        if let group = identity.groupId {
            subscribe(groupId: group)
        } else {
            subscribeIdentity()
        }
    }

    func retry(backend: FrolicBackend, route: E2ERoute?) {
        routeKey = nil
        load = .loading
        start(backend: backend, route: route)
    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        bloomTask?.cancel()
        paymentFrolic = nil
    }

    func becameActive() {
        tasks.append(Task { [weak self] in
            await self?.measureOffset()
            self?.scheduleBloom()
        })
        takePendingAction()
    }

    func takePendingAction() {
        let lockScreen = LockScreenInbox.take()
        if lockScreen == .imFree {
            sheet = .imFree
            return
        }
        guard lockScreen == .onlyIf || TodayInbox.take() == TodayInbox.onlyIf else { return }
        if scene == .open {
            picks = []
            sheet = .onlyIf
        }
    }

    func togglePick(_ userId: String) {
        if picks.contains(userId) {
            picks.remove(userId)
        } else {
            picks.insert(userId)
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    func tapDown(onlyIf people: [TodayPerson]) {
        guard let frolicId = frolic?.frolicId else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        sheet = nil
        picks = []
        pending = .down(people)
        guard !isFixture else { return }
        askForNotificationsOnce()
        var args: [String: ConvexEncodable?] = [
            "frolicId": frolicId,
            "kind": "down",
            "source": "app",
        ]
        if !people.isEmpty {
            let ids: [ConvexEncodable?] = people.map { $0.userId as ConvexEncodable? }
            args["onlyIf"] = ids
        }
        send("taps:tap", args, expecting: .down(people))
    }

    private func askForNotificationsOnce() {
        guard !AppGroup.defaults.bool(forKey: "today.notifications.asked") else { return }
        AppGroup.defaults.set(true, forKey: "today.notifications.asked")
        Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        }
    }

    func takeBack() {
        guard let frolicId = frolic?.frolicId else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        pending = .takeBack
        guard !isFixture else { return }
        send("taps:untap", ["frolicId": frolicId], expecting: .takeBack)
    }

    func hopIn() {
        guard let frolicId = frolic?.frolicId else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        pending = .hopIn
        guard !isFixture else { return }
        send("frolics:hopIn", ["frolicId": frolicId], expecting: .hopIn)
    }

    func sitOut() {
        guard let frolicId = frolic?.frolicId else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        sheet = nil
        pending = .sitOut
        guard !isFixture else { return }
        send("frolics:sitOut", ["frolicId": frolicId], expecting: .sitOut)
    }

    func setFree(_ state: String, window: TodayWindow?) {
        UISelectionFeedbackGenerator().selectionChanged()
        pendingFree = CrewFree(state: state, window: window, minutesAway: myFree?.minutesAway, updatedAt: now())
        sheet = nil
        guard !isFixture, let groupId = identity.groupId, let client, let token = identity.deviceToken as String? else { return }
        var args: [String: ConvexEncodable?] = [
            "deviceToken": token,
            "groupId": groupId,
            "day": TodayCopy.dayString(),
            "state": state,
        ]
        if let window {
            let value: [String: ConvexEncodable?] = ["start": window.start, "end": window.end]
            args["window"] = value
        }
        let untap = today?.myTap?.kind == "notToday" && state != "busy" ? frolic?.frolicId : nil
        tasks.append(Task { [weak self] in
            do {
                try await client.mutation("crew:setFree", with: args)
                if let untap {
                    try await client.mutation("taps:untap", with: ["deviceToken": token, "frolicId": untap])
                }
            } catch {
                self?.pendingFree = nil
                self?.fail(error)
            }
        })
    }

    func freeAfterAll() {
        let end = TodayCopy.todayAt(hour: 20)
        setFree("now", window: TodayWindow(start: min(now(), end - 60_000), end: end))
    }

    func imFree(minutes: Double) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        sheet = nil
        startError = nil
        startingPlan = true
        let forMinutes = min(240, max(60, minutes.rounded()))
        pendingFree = CrewFree(state: "now", window: TodayWindow(start: now(), end: now() + forMinutes * 60_000), minutesAway: myFree?.minutesAway, updatedAt: now())
        if isFixture {
            tasks.append(Task { [weak self] in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                self?.startingPlan = false
                self?.startError = "That didn't start. Try again."
            })
            return
        }
        guard let client, let groupId = identity.groupId else {
            startingPlan = false
            startError = "Frolic isn't connected to a server yet."
            return
        }
        let token = identity.deviceToken
        tasks.append(Task { [weak self] in
            do {
                let _: TodayImFreeResult = try await client.mutation("frolics:imFree", with: ["deviceToken": token, "groupId": groupId, "forMinutes": forMinutes])
                guard let self else { return }
                if self.today?.frolic?.plan != nil && self.today?.phase != TodayPhase.none { self.startingPlan = false }
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                if self.startingPlan && self.today?.frolic?.plan == nil {
                    self.startingPlan = false
                    self.startError = "That didn't start. Try again."
                }
            } catch {
                guard let self else { return }
                self.startingPlan = false
                self.pendingFree = nil
                self.startError = Self.imFreeMessage(for: error)
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
        })
    }

    func seeHint() {
        guard !hintSeen else { return }
        hintSeen = true
        AppGroup.defaults.set(true, forKey: "today.hint.down")
    }

    func onMyWay() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        guard let frolicId = frolic?.frolicId, !frolicId.isEmpty else { return }
        NotificationCenter.default.post(name: TodayInbox.onMyWayNotification, object: nil, userInfo: ["frolicId": frolicId])
        guard !isFixture else { return }
        let minutes = (walkMinutes ?? 0).rounded()
        send("etas:setMine", ["frolicId": frolicId, "minutes": minutes, "onTheWay": true], expecting: nil)
    }

    var walkMinutes: Double? {
        TodayCopy.walkMinutes(plan: plan, minutesAway: myFree?.minutesAway, from: walkFrom)
    }

    func prepareShare() {
        guard shareItem == nil, !shareBusy, let frolicId = frolic?.frolicId else { return }
        if isFixture {
            shareItem = TodayShareItem(url: URL(string: "https://frolic.app/p/DEMO")!, title: plan?.title ?? "Frolic")
            return
        }
        guard let client, let token = identity.deviceToken as String? else { return }
        shareBusy = true
        tasks.append(Task { [weak self] in
            do {
                let link: TodayShareLink = try await client.mutation("web/share:create", with: ["deviceToken": token, "frolicId": frolicId])
                guard let self else { return }
                self.shareBusy = false
                if let url = URL(string: link.url) {
                    self.shareItem = TodayShareItem(url: url, title: self.plan?.title ?? "Frolic")
                }
            } catch {
                self?.shareBusy = false
                self?.fail(error)
            }
        })
    }

    func openPayPage() {
        guard let frolicId = frolic?.frolicId else { return }
        if isFixture {
            sheet = nil
            payPage = TodayWebPage(url: URL(string: "https://whop.com")!)
            return
        }
        guard let client, let token = identity.deviceToken as String? else { return }
        payBusy = true
        tasks.append(Task { [weak self] in
            do {
                let link: TodayLink = try await client.mutation("whop/pay:link", with: ["deviceToken": token, "frolicId": frolicId])
                guard let self else { return }
                self.payBusy = false
                guard link.kind != "none", let raw = link.url, let url = URL(string: raw) else {
                    self.sheet = nil
                    return
                }
                self.sheet = nil
                self.payPage = TodayWebPage(url: url)
            } catch {
                self?.payBusy = false
                self?.fail(error)
            }
        })
    }

    func closePayPage() {
        payPage = nil
    }

    func closeShare() {
        shareItem = nil
    }

    func dismissNotice() {
        notice = nil
    }

    private func send(_ name: String, _ base: [String: ConvexEncodable?], expecting: PendingTap?) {
        guard let client, let token = identity.deviceToken as String? else {
            pending = nil
            showNotice("Frolic isn't connected to a server yet.")
            return
        }
        var args = base
        args["deviceToken"] = token
        tasks.append(Task { [weak self] in
            do {
                try await client.mutation(name, with: args)
                guard let self else { return }
                if expecting == .sitOut || expecting == nil { return }
                if let expecting, self.pending == expecting, self.confirms(expecting) {
                    self.pending = nil
                }
            } catch {
                guard let self else { return }
                if self.pending == expecting { self.pending = nil }
                self.fail(error)
            }
        })
    }

    private func confirms(_ tap: PendingTap) -> Bool {
        guard let today else { return false }
        switch tap {
        case .down:
            return today.myTap?.kind == "down" || today.phase == .on
        case .takeBack:
            return today.myTap == nil
        case .hopIn:
            return today.reveal?.me.going == true || today.reveal?.me.hopInWaiting == true
        case .sitOut:
            return today.reveal?.me.going == false
        }
    }

    private func fail(_ error: Error) {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        showNotice(Self.message(for: error))
    }

    private func showNotice(_ text: String) {
        notice = text
        noticeTask?.cancel()
        noticeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if !Task.isCancelled { self?.notice = nil }
        }
    }

    private func measureOffset() async {
        guard let client else { return }
        let before = Date().timeIntervalSince1970 * 1000
        do {
            let server: Double = try await client.mutation("clock:now")
            let after = Date().timeIntervalSince1970 * 1000
            offset = server - (before + after) / 2
        } catch {
            return
        }
    }

    private func subscribeIdentity() {
        guard let client, let token = identity.deviceToken as String? else { return }
        tasks.append(Task { [weak self] in
            do {
                for try await me in client.subscribe(to: "users:me", with: ["deviceToken": token], yielding: IdentityMe?.self).values {
                    guard let self else { return }
                    guard let group = me?.groups.first else {
                        self.load = .empty
                        continue
                    }
                    self.identity.setGroup(group.groupId)
                    self.subscribe(groupId: group.groupId)
                    return
                }
            } catch {
                self?.load = .error(Self.message(for: error))
            }
        })
    }

    private func subscribe(groupId: String) {
        guard let client, let token = identity.deviceToken as String? else { return }
        let day = TodayCopy.dayString()
        let cacheKey = "today.cache.\(groupId).\(day)"
        if today == nil, let data = AppGroup.defaults.data(forKey: cacheKey), let cached = try? JSONDecoder().decode(TodayView.self, from: data) {
            today = cached
            load = .ready
        }
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
                for try await view in client.subscribe(to: "frolics:today", with: args, yielding: TodayView.self).values {
                    self?.apply(view)
                    if let data = try? JSONEncoder().encode(view) {
                        AppGroup.defaults.set(data, forKey: cacheKey)
                    }
                }
            } catch {
                guard let self else { return }
                if self.today == nil { self.load = .error(Self.message(for: error)) }
            }
        })
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
                for try await value in client.subscribe(to: "garden:overview", with: args, yielding: TodayGardenOverview.self).values {
                    self?.gardenHealth = value.health
                }
            } catch {
                self?.gardenHealth = nil
            }
        })
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
                for try await value in client.subscribe(to: "garden:onThisDay", with: args, yielding: TodayOnThisDay?.self).values {
                    self?.onThisDay = value
                }
            } catch {
                self?.onThisDay = nil
            }
        })
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId, "day": TodayCopy.tomorrowString()]
                for try await view in client.subscribe(to: "frolics:today", with: args, yielding: TodayView.self).values {
                    guard let self else { return }
                    self.tomorrow = view.frolic?.day == TodayCopy.tomorrowString() ? view : nil
                }
            } catch {
                self?.tomorrow = nil
            }
        })
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId, "day": day]
                for try await view in client.subscribe(to: "crew:crew", with: args, yielding: CrewView.self).values {
                    guard let self else { return }
                    self.crew = view
                    if let pendingFree = self.pendingFree, view.me?.free?.state == pendingFree.state {
                        self.pendingFree = nil
                    }
                }
            } catch {
                return
            }
        })
    }

    private func subscribePayment(frolicId: String) {
        guard let client, let token = identity.deviceToken as String? else { return }
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "frolicId": frolicId]
                for try await payment in client.subscribe(to: "whop/pay:myPayment", with: args, yielding: TodayPayment.self).values {
                    guard let self else { return }
                    self.payment = payment
                    if payment.state != "due", self.payPage != nil, payment.state != "paying" {
                        self.payPage = nil
                    }
                }
            } catch {
                self?.payment = nil
            }
        })
    }

    private func subscribeDrop(frolicId: String) {
        guard let client else { return }
        let token = identity.deviceToken
        drop = nil
        tasks.append(Task { [weak self] in
            do {
                let args: [String: ConvexEncodable?] = ["deviceToken": token, "frolicId": frolicId]
                for try await value in client.subscribe(to: "drops:forPlan", with: args, yielding: TodayDrop?.self).values {
                    self?.drop = value
                }
            } catch {
                self?.drop = nil
            }
        })
    }

    private func apply(_ view: TodayView) {
        today = view
        load = .ready
        if let pending, confirms(pending) {
            self.pending = nil
        }
        if view.frolic?.plan != nil { startingPlan = false }
        if let frolicId = view.frolic?.frolicId, dropFrolic != frolicId {
            dropFrolic = frolicId
            subscribeDrop(frolicId: frolicId)
        }
        if let frolicId = view.frolic?.frolicId, paymentFrolic != frolicId, view.phase == .on || view.phase == .done {
            paymentFrolic = frolicId
            subscribePayment(frolicId: frolicId)
        }
        scheduleBloom()
    }

    private func applyFixture(_ fixture: TodayFixture, route: E2ERoute) {
        today = fixture.view
        crew = fixture.crew
        payment = fixture.payment
        pending = nil
        pendingFree = nil
        load = .ready
        bloomed = false
        bloomedFrolic = nil
        scheduleBloom()
        drop = route.query["drop"] != nil ? TodayDrop(hostedBy: "Cal Kayak Club", priceLabel: "$8", seatsLeft: 4) : nil
        tomorrow = route.query["tomorrow"] != nil ? TodayFixture.tomorrow() : nil
        startingPlan = route.state == "planning"
        gardenHealth = route.query["garden"] != nil ? TodayGardenHealth(state: "thirsty", line: "Your garden's getting thirsty", cta: "I'm free") : nil
        onThisDay = route.query["garden"] != nil ? TodayOnThisDay(frolicId: "fixture-past", label: "1 week ago today", title: "Cheese Board pizza", heroKey: "plan-late-night-food", photoUrl: nil) : nil
        if route.query["hint"] != nil { hintSeen = false }
        if fixture.sheet == .onlyIf {
            picks = Set(route.query["picks"].map { $0.split(separator: ",").map(String.init) } ?? [])
        }
        if let sheet = fixture.sheet {
            tasks.append(Task { [weak self] in
                try? await Task.sleep(nanoseconds: 450_000_000)
                self?.sheet = sheet
                if sheet == .share { self?.prepareShare() }
            })
        }
    }

    func scheduleBloom() {
        bloomTask?.cancel()
        guard let today, let reveal = today.reveal, today.phase == .on || today.phase == .done else {
            bloomed = false
            return
        }
        let frolicId = today.frolic?.frolicId ?? ""
        if today.phase == .done || bloomedFrolic == frolicId {
            bloomed = true
            bloomedFrolic = frolicId
            return
        }
        let target = max(reveal.me.bloomAt ?? reveal.bloomAt, reveal.revealAt)
        let wait = target - now()
        if wait <= 0 {
            flip(frolicId: frolicId, animated: wait > -15_000)
            return
        }
        bloomTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(max(wait - 4, 0) * 1_000_000))
            guard let self, !Task.isCancelled else { return }
            while self.now() < target {
                try? await Task.sleep(nanoseconds: 1_000_000)
                if Task.isCancelled { return }
            }
            self.flip(frolicId: frolicId, animated: true)
        }
    }

    private func flip(frolicId: String, animated: Bool) {
        bloomedFrolic = frolicId
        bloomed = true
        guard animated else { return }
        bloomID += 1
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func person(_ member: CrewMember) -> TodayPerson {
        TodayPerson(userId: member.userId, name: member.name, color: member.color, photoUrl: member.photoUrl, role: nil)
    }

    private func key(for route: E2ERoute?) -> String {
        let session = identity.deviceToken + "|" + (identity.groupId ?? "")
        guard let route, route.screen == "today" else { return "live|" + session }
        let query = route.query.filter { $0.key != "phase" }.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        return "\(route.state ?? "")?\(query)|" + session
    }

    static func message(for error: Error) -> String {
        guard let clientError = error as? ClientError else {
            return "Check your connection and try again."
        }
        switch clientError {
        case .ConvexError(let data):
            return convexMessage(data) ?? "That didn't go through. Try again."
        case .ServerError, .InternalError:
            return "Check your connection and try again."
        }
    }

    static func imFreeMessage(for error: Error) -> String {
        guard let clientError = error as? ClientError, case .ConvexError(let data) = clientError,
              let payload = data.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
        else { return "Check your connection and try again." }
        if object["kind"] as? String == "RateLimited" {
            let seconds = Int(((object["retryAfter"] as? Double) ?? 60_000) / 1000)
            return seconds >= 90 ? "Try again in \(Int((Double(seconds) / 60).rounded())) minutes." : "Try again in \(max(seconds, 1)) seconds."
        }
        switch object["code"] as? String {
        case "BAD_MINUTES": return "Pick how long you're free."
        case "UNKNOWN_DEVICE", "NOT_A_MEMBER": return "Join a crew first."
        default: return (object["message"] as? String) ?? "That didn't start. Try again."
        }
    }

    private static func convexMessage(_ data: String) -> String? {
        guard let payload = data.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any]
        else { return nil }
        if object["kind"] as? String == "RateLimited" { return "Easy there. Try again in a few seconds." }
        return object["message"] as? String
    }
}

struct TodayWebPage: Identifiable, Hashable {
    var url: URL
    var id: String { url.absoluteString }
}

struct TodayShareItem: Identifiable, Hashable {
    var url: URL
    var title: String
    var id: String { url.absoluteString }
}
