import Foundation

enum AppGroup {
    static let identifier = "group.com.frolic.app"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }

    enum Key {
        static let widgetHeadline = "widget.headline"
        static let widgetDetail = "widget.detail"
    }
}
