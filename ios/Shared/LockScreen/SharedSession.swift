import Foundation
import Security

enum SharedSession {
    private static let tokenAccount = "frolic.deviceToken"
    private static let defaults = AppGroup.defaults

    private enum Key {
        static let token = "lockscreen.deviceToken"
        static let groupId = "lockscreen.groupId"
        static let deploymentURL = "lockscreen.deploymentURL"
        static let clockOffset = "lockscreen.clockOffsetMs"
        static let userId = "lockscreen.userId"
        static let name = "lockscreen.name"
        static let walkMinutes = "lockscreen.walkMinutes"
    }

    static func store(deviceToken: String, groupId: String) {
        if !writeKeychain(deviceToken) {
            defaults.set(deviceToken, forKey: Key.token)
        } else {
            defaults.removeObject(forKey: Key.token)
        }
        defaults.set(groupId, forKey: Key.groupId)
    }

    static func clear() {
        deleteKeychain()
        for key in [Key.token, Key.groupId, Key.userId, Key.name] {
            defaults.removeObject(forKey: key)
        }
    }

    static var deviceToken: String? {
        readKeychain() ?? defaults.string(forKey: Key.token)
    }

    static var groupId: String? { defaults.string(forKey: Key.groupId) }

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

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: tokenAccount,
            kSecAttrAccessGroup as String: AppGroup.identifier,
        ]
    }

    private static func writeKeychain(_ token: String) -> Bool {
        deleteKeychain()
        var query = baseQuery()
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private static func readKeychain() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteKeychain() {
        SecItemDelete(baseQuery() as CFDictionary)
    }
}
