import Combine
import ConvexMobile
import Foundation

enum CheckInFailure: LocalizedError {
    case noServer
    case noIdentity
    case noCrew
    case message(String)

    var errorDescription: String? {
        switch self {
        case .noServer: "Frolic isn't connected to a server yet."
        case .noIdentity: "Frolic doesn't know who you are yet. Join your crew first."
        case .noCrew: "You're not in a crew yet."
        case .message(let text): text
        }
    }
}

@MainActor
final class CheckInSession {
    static let shared = CheckInSession()

    private var pending: [UUID: AnyCancellable] = [:]

    var token: String? { FrolicIdentity.validToken(FrolicIdentity.shared.deviceToken) }

    var groupOverride: String? { FrolicIdentity.shared.groupId }

    func requireToken() throws -> String {
        guard let token else { throw CheckInFailure.noIdentity }
        return token
    }

    func me(client: ConvexClient, token: String) async throws -> WireMe? {
        let key = UUID()
        defer { pending[key] = nil }
        return try await withCheckedThrowingContinuation { continuation in
            var settled = false
            pending[key] = client
                .subscribe(to: "users:me", with: ["deviceToken": token], yielding: WireMe?.self)
                .receive(on: DispatchQueue.main)
                .sink(
                    receiveCompletion: { completion in
                        guard !settled, case .failure(let error) = completion else { return }
                        settled = true
                        continuation.resume(throwing: error)
                    },
                    receiveValue: { value in
                        guard !settled else { return }
                        settled = true
                        continuation.resume(returning: value)
                    }
                )
        }
    }
}

func checkInMessage(_ error: Error) -> String {
    if let failure = error as? CheckInFailure {
        return failure.errorDescription ?? "That didn't go through. Try again."
    }
    let text = String(describing: error)
    if text.contains("UNKNOWN_DEVICE") { return "Frolic doesn't know who you are yet. Join your crew first." }
    if text.contains("NOT_GOING") { return "You're not on this one anymore." }
    if text.contains("NOT_CHECKED_IN") { return "Check in first, then the snap is yours." }
    if text.contains("NO_SNAP_WINDOW") { return "The snap window closed. Start it again together." }
    if text.localizedCaseInsensitiveContains("offline") || text.localizedCaseInsensitiveContains("network")
        || text.localizedCaseInsensitiveContains("connect") {
        return "Frolic can't reach the server right now."
    }
    return "That didn't go through. Try again."
}

enum CheckInClock {
    static var timeZone: TimeZone {
        ProcessInfo.processInfo.environment["FROLIC_TIMEZONE"].flatMap(TimeZone.init(identifier:))
            ?? TimeZone(identifier: "America/Los_Angeles") ?? .current
    }

    static func time(_ ms: Double) -> String {
        format(ms, "h:mm")
    }

    static func day(_ ms: Double) -> String {
        format(ms, "MMM d")
    }

    private static func format(_ ms: Double, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = pattern
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}
