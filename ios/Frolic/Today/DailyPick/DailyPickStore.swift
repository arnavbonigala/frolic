import ConvexMobile
import Foundation
import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class DailyPickStore {
    private(set) var phase: DailyPickPhase = .loading
    private(set) var view: DailyPickView?
    private(set) var pending: String?
    private(set) var failed = false
    private(set) var revealID = 0
    private(set) var isFixture = false

    private let identity = FrolicIdentity.shared
    private var client: ConvexClient?
    private var task: Task<Void, Never>?
    private var key: String?

    var myAnswer: String? { pending ?? view?.myAnswer }
    var answered: Bool { myAnswer != nil }

    func tallies(me: TodayPerson?) -> [DailyPickTally]? {
        guard let view, let results = view.results else { return nil }
        guard let pending, pending != view.myAnswer else { return results.byOption }
        let myId = me?.userId
        let mine = results.byOption.flatMap(\.people).first { $0.userId == myId } ?? me
        return results.byOption.map { tally in
            var tally = tally
            let before = tally.people.count
            tally.people.removeAll { $0.userId == myId }
            if tally.option == pending, let mine { tally.people.insert(mine, at: 0) }
            tally.count += Double(tally.people.count - before)
            return tally
        }
    }

    func start(backend: FrolicBackend, route: E2ERoute?) {
        let newKey = identity.deviceToken + "|" + (identity.groupId ?? "") + "|" + (route?.query["pick"] ?? "")
        guard newKey != key else { return }
        key = newKey
        task?.cancel()
        #if DEBUG || E2E
        if let fixture = route?.query["pick"], applyFixture(fixture) { return }
        #endif
        isFixture = false
        guard let client = backend.client else {
            phase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        guard let groupId = identity.groupId else { return }
        self.client = client
        if view == nil, let cached = Self.cached(groupId) {
            view = cached
            phase = .ready
        }
        if view == nil { phase = .loading }
        let args: [String: ConvexEncodable?] = ["deviceToken": identity.deviceToken, "groupId": groupId]
        task = Task { [weak self] in
            do {
                for try await next in client.subscribe(to: "dailyPick:today", with: args, yielding: DailyPickView.self).values {
                    self?.apply(next)
                }
            } catch {
                guard let self, !Task.isCancelled else { return }
                if self.view == nil { self.phase = .error(TodayStore.message(for: error)) }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        key = nil
    }

    func retry(backend: FrolicBackend, route: E2ERoute?) {
        key = nil
        phase = .loading
        start(backend: backend, route: route)
    }

    func pick(_ option: String) {
        guard option != myAnswer else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        failed = false
        pending = option
        #if DEBUG || E2E
        if isFixture {
            fixtureAnswer(option)
            return
        }
        #endif
        guard let client, let groupId = identity.groupId else {
            fail(option)
            return
        }
        let token = identity.deviceToken
        Task { [weak self] in
            do {
                try await client.mutation("dailyPick:answer", with: ["deviceToken": token, "groupId": groupId, "option": option])
            } catch {
                self?.fail(option)
            }
        }
    }

    private func apply(_ next: DailyPickView) {
        let wasHidden = view?.results == nil
        if view?.day != next.day { pending = nil }
        view = next
        phase = .ready
        if !isFixture, let groupId = identity.groupId, let data = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(data, forKey: Self.cacheKey + groupId)
        }
        if pending == next.myAnswer { pending = nil }
        if wasHidden && next.results != nil && next.myAnswer != nil {
            revealID += 1
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            AccessibilityNotification.Announcement(DailyPickCopy.revealed).post()
        }
    }

    private static let cacheKey = "frolic.dailyPick."

    private static func cached(_ groupId: String) -> DailyPickView? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey + groupId),
              let view = try? JSONDecoder().decode(DailyPickView.self, from: data)
        else { return nil }
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        let today = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        return view.day == today ? view : nil
    }

    private func fail(_ option: String) {
        guard pending == option else { return }
        pending = nil
        failed = true
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        AccessibilityNotification.Announcement(DailyPickCopy.failed).post()
    }

    #if DEBUG || E2E
    private static let crew = [
        TodayPerson(userId: "maya", name: "Maya", color: "pink", photoUrl: "/p/avatar/maya.jpg", role: nil),
        TodayPerson(userId: "dev", name: "Dev", color: "cobalt", photoUrl: "/p/avatar/dev.jpg", role: nil),
        TodayPerson(userId: "jordan", name: "Jordan", color: "moss", photoUrl: "/p/avatar/jordan.jpg", role: nil),
        TodayPerson(userId: "priya", name: "Priya", color: "lilac", photoUrl: "/p/avatar/priya.jpg", role: nil),
    ]
    static let fixtureMe = TodayPerson(userId: "me", name: "You", color: "tomato", photoUrl: nil, role: nil)

    private func applyFixture(_ name: String) -> Bool {
        let base = DailyPickView(day: "2026-11-15", question: "Late night: noodles or tacos?", options: ["Noodles", "Tacos"], myAnswer: nil, results: nil)
        isFixture = true
        pending = nil
        failed = false
        switch name {
        case "loading":
            view = nil
            phase = .loading
        case "error":
            view = nil
            phase = .error("Check your connection and try again.")
        case "unanswered":
            view = base
            phase = .ready
        case "answered":
            view = Self.answeredFixture(base, others: Self.crew)
            phase = .ready
        case "alone":
            view = Self.answeredFixture(base, others: [])
            phase = .ready
        default:
            isFixture = false
            return false
        }
        return true
    }

    private func fixtureAnswer(_ option: String) {
        guard let base = view else { return }
        let others = route == "alone" ? [] : Self.crew
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            var next = Self.answeredFixture(base, others: others, mine: option)
            next.myAnswer = option
            self?.apply(next)
        }
    }

    private var route: String? { key?.split(separator: "|").last.map(String.init) }

    private static func answeredFixture(_ base: DailyPickView, others: [TodayPerson], mine: String = "Tacos") -> DailyPickView {
        var view = base
        view.myAnswer = mine
        let byOption = base.options.enumerated().map { index, option in
            var people = others.enumerated().filter { $0.offset % base.options.count == index }.map(\.element)
            if option == mine { people.insert(fixtureMe, at: 0) }
            return DailyPickTally(option: option, count: Double(people.count), people: people)
        }
        view.results = DailyPickResults(total: Double(others.count + 1), byOption: byOption)
        return view
    }
    #endif
}
