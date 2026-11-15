import Foundation
import Security

enum OnboardingIdentity {
    private static let keychainService = "com.frolic.app"
    private static let tokenAccount = "deviceToken"
    private static let tokenEnvironmentKey = "FROLIC_DEVICE_TOKEN"
    private static let groupEnvironmentKey = "FROLIC_GROUP_ID"

    private enum Keys {
        static let complete = "frolic.onboarding.complete"
        static let groupId = "frolic.onboarding.groupId"
        static let firstName = "frolic.onboarding.firstName"
        static let inviteCode = "frolic.onboarding.inviteCode"
        static let photo = "frolic.onboarding.photo"
        static let freeState = "frolic.onboarding.freeState"
    }

    static var deviceToken: String {
        if let override = ProcessInfo.processInfo.environment[tokenEnvironmentKey],
           (32...256).contains(override.count) {
            return override
        }
        if let stored = readKeychain(tokenAccount), (32...256).contains(stored.count) {
            return stored
        }
        let token = makeToken()
        writeKeychain(token, account: tokenAccount)
        return token
    }

    static var isComplete: Bool {
        get {
            guard UserDefaults.standard.bool(forKey: Keys.complete), let groupId else { return false }
            return !groupId.isEmpty
        }
        set { UserDefaults.standard.set(newValue, forKey: Keys.complete) }
    }

    static var groupId: String? {
        get {
            if let override = ProcessInfo.processInfo.environment[groupEnvironmentKey], !override.isEmpty {
                return override
            }
            return UserDefaults.standard.string(forKey: Keys.groupId)
        }
        set { UserDefaults.standard.set(newValue, forKey: Keys.groupId) }
    }

    static var firstName: String? {
        get { UserDefaults.standard.string(forKey: Keys.firstName) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.firstName) }
    }

    static var inviteCode: String? {
        get { UserDefaults.standard.string(forKey: Keys.inviteCode) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.inviteCode) }
    }

    static var photo: Data? {
        get { UserDefaults.standard.data(forKey: Keys.photo) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.photo) }
    }

    static var lastFreeState: String? {
        get { UserDefaults.standard.string(forKey: Keys.freeState) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.freeState) }
    }

    static func reset() {
        for key in [Keys.complete, Keys.groupId, Keys.firstName, Keys.inviteCode, Keys.photo, Keys.freeState] {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    private static func makeToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess {
            return bytes.map { String(format: "%02x", $0) }.joined()
        }
        return (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased()
    }

    private static func readKeychain(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
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

    private static func writeKeychain(_ value: String, account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(attributes as CFDictionary, nil)
    }
}

struct InviteLink: Equatable {
    var code: String
    var raw: String?

    static let environmentKey = "FROLIC_INVITE_CODE"

    init?(url: URL) {
        let code: String?
        if url.scheme?.lowercased() == "frolic", url.host?.lowercased() == "join" {
            let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            code = Self.clean(path.isEmpty ? URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value : path)
        } else if let host = url.host?.lowercased(), host == "frolic.app" || host == "www.frolic.app" {
            let parts = url.path.split(separator: "/").map(String.init)
            code = parts.count >= 2 && parts[0].lowercased() == "j" ? Self.clean(parts[1]) : nil
        } else {
            code = Self.clean(url.lastPathComponent)
        }
        guard let code, !code.isEmpty else { return nil }
        self.code = code
        self.raw = url.absoluteString
    }

    init?(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if let url = URL(string: trimmed), url.scheme != nil, let link = InviteLink(url: url) {
            self = link
            return
        }
        guard let code = Self.clean(trimmed), !code.isEmpty else { return nil }
        self.code = code
        self.raw = nil
    }

    static var launchOverride: InviteLink? {
        guard let raw = ProcessInfo.processInfo.environment[environmentKey] else { return nil }
        return InviteLink(text: raw)
    }

    private static func clean(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let allowed = CharacterSet.alphanumerics
        let code = raw.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")).uppercased()
        guard !code.isEmpty, code.count <= 64, code.unicodeScalars.allSatisfy({ allowed.contains($0) }) else { return nil }
        return code
    }
}
