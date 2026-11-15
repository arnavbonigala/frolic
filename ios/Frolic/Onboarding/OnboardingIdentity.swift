import Foundation

@MainActor
enum OnboardingIdentity {
    private enum Keys {
        static let complete = "frolic.onboarding.complete"
        static let groupId = "frolic.onboarding.groupId"
        static let firstName = "frolic.onboarding.firstName"
        static let inviteCode = "frolic.onboarding.inviteCode"
        static let freeState = "frolic.onboarding.freeState"
    }

    static var deviceToken: String { FrolicIdentity.shared.deviceToken }

    static var isComplete: Bool {
        get {
            if UserDefaults.standard.bool(forKey: Keys.complete), FrolicIdentity.shared.groupId != nil { return true }
            return UserDefaults.standard.string(forKey: Keys.groupId) == nil && FrolicIdentity.shared.groupId != nil
        }
        set { UserDefaults.standard.set(newValue, forKey: Keys.complete) }
    }

    static var groupId: String? {
        get { UserDefaults.standard.string(forKey: Keys.groupId) ?? FrolicIdentity.shared.groupId }
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

    static var lastFreeState: String? {
        get { UserDefaults.standard.string(forKey: Keys.freeState) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.freeState) }
    }

    static func commit(groupId: String) {
        FrolicIdentity.shared.setGroup(groupId)
        UserDefaults.standard.removeObject(forKey: Keys.groupId)
        UserDefaults.standard.set(true, forKey: Keys.complete)
    }

    static func reset() {
        for key in [Keys.complete, Keys.groupId, Keys.firstName, Keys.inviteCode, Keys.freeState] {
            UserDefaults.standard.removeObject(forKey: key)
        }
        FrolicIdentity.shared.setGroup(nil)
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
