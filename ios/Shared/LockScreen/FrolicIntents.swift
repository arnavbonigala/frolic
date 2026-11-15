import ActivityKit
import AppIntents
import WidgetKit

struct ImDownIntent: AppIntent {
    static let title: LocalizedStringResource = "I'm down"
    static let description = IntentDescription("Say yes to today's plan. Nobody sees it unless a friend says yes too.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await LockScreenActions.tap("down", source: .app)
        return .result(dialog: "\(LockScreenCopy.planted)")
    }
}

struct NotTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "Not today"
    static let description = IntentDescription("Take the day off. Nobody gets told.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await LockScreenActions.tap("notToday", source: .app)
        return .result(dialog: "\(LockScreenCopy.dayOff)")
    }
}

struct HopInIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Hop in"
    static let description = IntentDescription("Join today's frolic after it's on.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = try await LockScreenActions.hopIn()
        if let snapshot = LockScreenStore.snapshot {
            await LiveActivityController.sync(with: snapshot)
        }
        let place = LockScreenStore.snapshot?.placeName ?? "the spot"
        return .result(dialog: result == "waiting" ? "It's full right now. You're next if a spot opens." : "You're in. See you at \(place).")
    }
}

struct OnMyWayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "I'm on my way"
    static let description = IntentDescription("Tell the people going that you're on your way.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        let snapshot = LockScreenStore.snapshot
        let minutes = LiveActivityController.walkMinutes(to: snapshot) ?? SharedSession.walkMinutes ?? 8
        SharedSession.walkMinutes = minutes
        await LiveActivityController.markOnMyWay(minutes: minutes)
        try await LockScreenActions.setOnMyWay(minutes: minutes)
        return .result()
    }
}

struct ImHereIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "I'm here"
    static let description = IntentDescription("Check in at today's spot.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        await LiveActivityController.markArrived()
        try await LockScreenActions.checkIn()
        return .result()
    }
}

struct RefreshTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "Refresh today's plan"
    static let isDiscoverable = false
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult {
        await LockScreenActions.refresh()
        return .result()
    }
}
