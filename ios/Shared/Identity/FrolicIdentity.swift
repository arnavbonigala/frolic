import Foundation
import Observation
import Security

struct FrolicCrew: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var color: String
}

@MainActor
@Observable
final class FrolicIdentity {
    static let shared = FrolicIdentity()

    static let tokenEnvironmentKey = "FROLIC_DEVICE_TOKEN"
    static let groupEnvironmentKey = "FROLIC_GROUP_ID"
    static let tokenDefaultsKey = "frolic.deviceToken"
    static let groupDefaultsKey = "frolic.groupId"
    static let crewsDefaultsKey = "frolic.crews"
    static let keychainService = "com.frolic.app"
    static let keychainAccount = "deviceToken"

    private(set) var deviceToken: String
    private(set) var groupId: String?
    private(set) var crews: [FrolicCrew] = []
    private var pinnedGroup: String?

    init(environment: [String: String] = ProcessInfo.processInfo.environment, defaults: UserDefaults = AppGroup.defaults) {
        if let token = Self.validToken(environment[Self.tokenEnvironmentKey]) {
            deviceToken = token
        } else if let token = Self.validToken(Self.readKeychain()) ?? Self.validToken(defaults.string(forKey: Self.tokenDefaultsKey)) {
            deviceToken = token
        } else {
            let token = Self.mintToken()
            Self.writeKeychain(token)
            deviceToken = token
        }
        defaults.set(deviceToken, forKey: Self.tokenDefaultsKey)
        pinnedGroup = Self.nonEmpty(environment[Self.groupEnvironmentKey])
        crews = Self.storedCrews(AppGroup.defaults)
        groupId = pinnedGroup ?? Self.storedGroup(defaults) ?? crews.first?.id
    }

    func refresh() {
        let stored = Self.storedCrews(AppGroup.defaults)
        if stored != crews { crews = stored }
        guard pinnedGroup == nil, let group = Self.storedGroup(AppGroup.defaults), group != groupId else { return }
        groupId = group
    }

    func adopt(crews incoming: [FrolicCrew]) {
        var list: [FrolicCrew] = []
        for crew in incoming where !list.contains(where: { $0.id == crew.id }) {
            list.append(crew)
        }
        if let pinnedGroup, !list.contains(where: { $0.id == pinnedGroup }) {
            let known = crews.first { $0.id == pinnedGroup }
            list.insert(known ?? FrolicCrew(id: pinnedGroup, name: "Your crew", color: ""), at: 0)
        }
        if list != crews {
            crews = list
            Self.storeCrews(list, AppGroup.defaults)
        }
        if let pinnedGroup {
            if groupId != pinnedGroup { groupId = pinnedGroup }
            return
        }
        if let groupId, list.contains(where: { $0.id == groupId }) { return }
        guard let next = list.first?.id else { return }
        groupId = next
        AppGroup.defaults.set(next, forKey: Self.groupDefaultsKey)
        AppGroup.defaults.set(next, forKey: "session.groupId")
    }

    func activate(_ id: String) {
        guard Self.nonEmpty(id) != nil, id != groupId else { return }
        setGroup(id)
    }

    private static func storedCrews(_ defaults: UserDefaults) -> [FrolicCrew] {
        guard let data = defaults.data(forKey: crewsDefaultsKey),
              let list = try? JSONDecoder().decode([FrolicCrew].self, from: data)
        else { return [] }
        return list
    }

    private static func storeCrews(_ list: [FrolicCrew], _ defaults: UserDefaults) {
        guard let data = try? JSONEncoder().encode(list) else { return }
        defaults.set(data, forKey: crewsDefaultsKey)
    }

    private static func storedGroup(_ defaults: UserDefaults) -> String? {
        nonEmpty(defaults.string(forKey: groupDefaultsKey))
            ?? nonEmpty(defaults.string(forKey: "session.groupId"))
            ?? nonEmpty(UserDefaults.standard.string(forKey: "frolic.onboarding.groupId"))
    }

    static var storedGroupChoice: String? { storedGroup(AppGroup.defaults) }

    func setGroup(_ id: String?) {
        groupId = Self.nonEmpty(id)
        if pinnedGroup != nil { pinnedGroup = groupId }
        if let groupId {
            if !crews.contains(where: { $0.id == groupId }) {
                crews.append(FrolicCrew(id: groupId, name: "", color: ""))
                Self.storeCrews(crews, AppGroup.defaults)
            }
            AppGroup.defaults.set(groupId, forKey: Self.groupDefaultsKey)
            AppGroup.defaults.set(groupId, forKey: "session.groupId")
        } else {
            AppGroup.defaults.removeObject(forKey: Self.groupDefaultsKey)
            AppGroup.defaults.removeObject(forKey: "session.groupId")
        }
    }

    func signIn(deviceToken token: String, groupId group: String?) {
        guard let token = Self.validToken(token) else { return }
        deviceToken = token
        Self.writeKeychain(token)
        AppGroup.defaults.set(token, forKey: Self.tokenDefaultsKey)
        if let group { setGroup(group) }
        AppGroup.defaults.set(token, forKey: "session.deviceToken")
    }

    static func validToken(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), (32...256).contains(value.count) else { return nil }
        return value
    }

    private static func nonEmpty(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }

    private static func mintToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<24).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
    }

    private static func readKeychain() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func writeKeychain(_ token: String) {
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }
}
