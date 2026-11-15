import Foundation

enum TodayInbox {
    static let key = "frolic.pendingAction"
    static let onlyIf = "onlyIf"
    static let openOnlyIfNotification = Notification.Name("frolic.today.openOnlyIf")
    static let onMyWayNotification = Notification.Name("frolic.today.onMyWay")

    static func post(_ action: String) {
        AppGroup.defaults.set(action, forKey: key)
        NotificationCenter.default.post(name: openOnlyIfNotification, object: nil)
    }

    static func take() -> String? {
        let defaults = AppGroup.defaults
        guard let value = defaults.string(forKey: key) else { return nil }
        defaults.removeObject(forKey: key)
        return value
    }
}
