import Foundation
import Security

enum YouIdentity {
    static let tokenEnvironmentKey = "FROLIC_DEVICE_TOKEN"
    static let groupEnvironmentKey = "FROLIC_GROUP_ID"
    static let keychainService = "com.frolic.app"
    static let tokenAccount = "deviceToken"
    static let groupDefaultsKey = "frolic.groupId"
    static let tokenDefaultsKey = "frolic.deviceToken"

    static var token: String? {
        if let fromEnvironment = clean(ProcessInfo.processInfo.environment[tokenEnvironmentKey]) {
            return fromEnvironment
        }
        if let stored = keychainToken(), !stored.isEmpty {
            return stored
        }
        #if DEBUG || E2E
        if let seeded = clean(UserDefaults.standard.string(forKey: tokenDefaultsKey)) {
            return seeded
        }
        #endif
        return nil
    }

    static var groupId: String? {
        if let fromEnvironment = clean(ProcessInfo.processInfo.environment[groupEnvironmentKey]) {
            return fromEnvironment
        }
        #if DEBUG || E2E
        if let seeded = clean(UserDefaults.standard.string(forKey: groupDefaultsKey)) {
            return seeded
        }
        #endif
        return nil
    }

    static func store(token: String, groupId: String?) {
        let value = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.count >= 32 else { return }
        saveKeychainToken(value)
        #if DEBUG || E2E
        UserDefaults.standard.set(value, forKey: tokenDefaultsKey)
        #endif
        if let groupId, !groupId.isEmpty {
            store(groupId: groupId)
        }
    }

    static func store(groupId: String) {
        guard !groupId.isEmpty else { return }
        UserDefaults.standard.set(groupId, forKey: groupDefaultsKey)
    }

    static func keychainToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: tokenAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8)
        else { return nil }
        return value
    }

    private static func saveKeychainToken(_ value: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: tokenAccount,
        ]
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecSuccess {
            return
        }
        var insert = query
        insert.merge(attributes) { _, new in new }
        SecItemAdd(insert as CFDictionary, nil)
    }

    private static func clean(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
