import Combine
import ConvexMobile
import Foundation
import Security

enum CheckInFailure: LocalizedError {
    case noServer
    case noIdentity
    case noCrew
    case message(String)

    var errorDescription: String? {
        switch self {
        case .noServer: "Frolic isn't connected to a server yet."
        case .noIdentity: "Frolic doesn't know who you are yet."
        case .noCrew: "You're not in a crew yet."
        case .message(let text): text
        }
    }
}

@MainActor
final class CheckInSession {
    static let shared = CheckInSession()

    private let service = "com.frolic.app"
    private let account = "deviceToken"
    private let launchOverride = "FROLIC_DEVICE_TOKEN"
    private var groupCache: [String: String] = [:]
    private var cancellables: Set<AnyCancellable> = []

    var token: String? {
        if let raw = ProcessInfo.processInfo.environment[launchOverride],
           (32...256).contains(raw.count) {
            return raw
        }
        if let stored = readKeychain(), (32...256).contains(stored.count) {
            return stored
        }
        let minted = Self.randomToken()
        writeKeychain(minted)
        return minted
    }

    func requireToken() throws -> String {
        guard let token else { throw CheckInFailure.noIdentity }
        return token
    }

    func me(client: ConvexClient, token: String) async throws -> WireMe? {
        try await withCheckedThrowingContinuation { continuation in
            var settled = false
            let cancellable = client
                .subscribe(to: "users:me", with: ["deviceToken": token], yielding: WireMe?.self)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        guard !settled else { return }
                        if case .failure(let error) = completion {
                            settled = true
                            continuation.resume(throwing: error)
                        }
                    },
                    receiveValue: { value in
                        guard !settled else { return }
                        settled = true
                        continuation.resume(returning: value)
                    }
                )
            cancellables.insert(cancellable)
        }
    }

    func groupId(client: ConvexClient, token: String) async throws -> String {
        if let cached = groupCache[token] { return cached }
        guard let me = try await me(client: client, token: token),
              let groupId = me.groups.first?.groupId
        else { throw CheckInFailure.noCrew }
        groupCache[token] = groupId
        return groupId
    }

    func resetGroupCache() {
        groupCache.removeAll()
    }

    private func readKeychain() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let text = String(data: data, encoding: .utf8)
        else { return nil }
        return text
    }

    private func writeKeychain(_ value: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = Data(value.utf8)
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(insert as CFDictionary, nil)
    }

    private static func randomToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}

func checkInMessage(_ error: Error) -> String {
    if let failure = error as? CheckInFailure {
        return failure.errorDescription ?? "Something went wrong."
    }
    let text = String(describing: error)
    if text.localizedCaseInsensitiveContains("offline") || text.localizedCaseInsensitiveContains("network") {
        return "Frolic can't reach the server right now."
    }
    if text.contains("UNKNOWN_DEVICE") {
        return "Frolic doesn't know who you are yet."
    }
    if text.contains("NOT_GOING") {
        return "This one isn't yours to walk to."
    }
    if text.contains("NO_SNAP_WINDOW") {
        return "The group snap window closed. Start it again."
    }
    return "That didn't go through. Try again."
}

enum CheckInClock {
    static func timeZone() -> TimeZone {
        if let name = ProcessInfo.processInfo.environment["FROLIC_TIMEZONE"],
           let zone = TimeZone(identifier: name) {
            return zone
        }
        return .current
    }

    static func time(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone()
        formatter.dateFormat = "h:mm"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    static func day(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = timeZone()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    static func minutesUntil(_ ms: Double, now: Date = Date()) -> Int {
        max(0, Int((ms - now.timeIntervalSince1970 * 1000) / 60000))
    }
}
