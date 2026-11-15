import Foundation

enum SharedSession {
    private static let defaults = AppGroup.defaults

    private enum Key {
        static let deploymentURL = "lockscreen.deploymentURL"
        static let clockOffset = "lockscreen.clockOffsetMs"
        static let userId = "lockscreen.userId"
        static let name = "lockscreen.name"
        static let walkMinutes = "lockscreen.walkMinutes"
    }

    static var deviceToken: String? {
        FrolicIdentity.validToken(defaults.string(forKey: FrolicIdentity.tokenDefaultsKey))
    }

    static var groupId: String? {
        defaults.string(forKey: FrolicIdentity.groupDefaultsKey).flatMap { $0.isEmpty ? nil : $0 }
    }

    static var deploymentURL: String? {
        get { defaults.string(forKey: Key.deploymentURL) }
        set { defaults.set(newValue, forKey: Key.deploymentURL) }
    }

    static var clockOffset: TimeInterval {
        get { defaults.double(forKey: Key.clockOffset) / 1000 }
        set { defaults.set(newValue * 1000, forKey: Key.clockOffset) }
    }

    static var userId: String? {
        get { defaults.string(forKey: Key.userId) }
        set { defaults.set(newValue, forKey: Key.userId) }
    }

    static var name: String? {
        get { defaults.string(forKey: Key.name) }
        set { defaults.set(newValue, forKey: Key.name) }
    }

    static var walkMinutes: Int? {
        get { defaults.object(forKey: Key.walkMinutes) as? Int }
        set { defaults.set(newValue, forKey: Key.walkMinutes) }
    }

    static var credentials: (token: String, groupId: String, url: String)? {
        guard let token = deviceToken, let groupId, let url = deploymentURL else { return nil }
        return (token, groupId, url)
    }

    static func localDate(serverMs: Double) -> Date {
        Date(timeIntervalSince1970: serverMs / 1000 - clockOffset)
    }
}
