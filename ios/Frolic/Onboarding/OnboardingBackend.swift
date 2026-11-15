import Combine
import ConvexMobile
import Foundation

struct InvitePreview: Decodable, Equatable {
    struct Member: Decodable, Equatable {
        var name: String
        var color: String
    }

    var groupName: String
    var invitedBy: String
    var members: [Member]
    var memberCount: Int
}

struct JoinOutcome: Decodable, Equatable {
    var userId: String
    var groupId: String
    var frolicId: String?
}

struct CreateOutcome: Decodable, Equatable {
    var userId: String
    var groupId: String
    var inviteCode: String
}

enum OnboardingFailure: Error, Equatable {
    case notConnected
    case offline
    case inviteExpired
    case inviteUnknown
    case name
    case rateLimited
    case message(String)

    var title: String {
        switch self {
        case .notConnected: "Frolic isn't connected to a server yet"
        case .offline: "You're offline"
        case .inviteExpired: "This invite link expired"
        case .inviteUnknown: "That invite link isn't one we know"
        case .name: "That name is too long"
        case .rateLimited: "Give it a minute"
        case .message(let text): text
        }
    }

    var detail: String {
        switch self {
        case .notConnected: "Frolic will try again as soon as it has one."
        case .offline: "Frolic will catch up as soon as you're back online."
        case .inviteExpired: "Ask whoever invited you for a fresh link, or start your own crew."
        case .inviteUnknown: "Check the link, or start your own crew."
        case .name: "First names top out at 40 characters."
        case .rateLimited: "Too many tries just now. Give it a minute and tap again."
        case .message: "Tap again in a moment."
        }
    }

    var canRetry: Bool {
        switch self {
        case .inviteExpired, .inviteUnknown, .name: false
        default: true
        }
    }
}

@MainActor
final class OnboardingBackend {
    private let client: ConvexClient?

    init(client: ConvexClient?) {
        self.client = client
    }

    var isConfigured: Bool { client != nil }

    func preview(code: String) async throws -> InvitePreview {
        guard let client else { throw OnboardingFailure.notConnected }
        do {
            let publisher = client.subscribe(to: "users:invitePreview", with: ["inviteCode": code], yielding: InvitePreview?.self)
            for try await value in publisher.values {
                guard let value else { throw OnboardingFailure.inviteUnknown }
                return value
            }
            throw OnboardingFailure.inviteUnknown
        } catch let failure as OnboardingFailure {
            throw failure
        } catch {
            throw Self.classify(error)
        }
    }

    func join(code: String, firstName: String) async throws -> JoinOutcome {
        guard let client else { throw OnboardingFailure.notConnected }
        do {
            let outcome: JoinOutcome = try await client.mutation("users:joinGroup", with: [
                "deviceToken": OnboardingIdentity.deviceToken,
                "firstName": firstName,
                "inviteCode": code,
            ])
            return outcome
        } catch {
            throw Self.classify(error)
        }
    }

    func createGroup(firstName: String) async throws -> CreateOutcome {
        guard let client else { throw OnboardingFailure.notConnected }
        do {
            let outcome: CreateOutcome = try await client.mutation("users:createGroup", with: [
                "deviceToken": OnboardingIdentity.deviceToken,
                "firstName": firstName,
                "groupName": firstName + "'s crew",
            ])
            return outcome
        } catch {
            throw Self.classify(error)
        }
    }

    func uploadPhoto(_ data: Data) async throws -> String {
        guard let client else { throw OnboardingFailure.notConnected }
        let uploadUrl: String = try await client.mutation("users:generateUploadUrl", with: [
            "deviceToken": OnboardingIdentity.deviceToken,
        ])
        guard let url = URL(string: uploadUrl) else { throw OnboardingFailure.message("The photo didn't upload.") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        let (body, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let storageId = payload["storageId"] as? String
        else { throw OnboardingFailure.message("The photo didn't upload.") }
        try await client.mutation("users:updateProfile", with: [
            "deviceToken": OnboardingIdentity.deviceToken,
            "photoId": storageId,
        ])
        return storageId
    }

    func todayPlanTitle(groupId: String) async -> [String] {
        guard let client, !groupId.isEmpty else { return [] }
        struct Peek: Decodable {
            struct Frolic: Decodable {
                struct Plan: Decodable { var title: String }
                var plan: Plan?
            }
            var frolic: Frolic?
        }
        do {
            let publisher = client.subscribe(to: "frolics:today", with: [
                "deviceToken": OnboardingIdentity.deviceToken,
                "groupId": groupId,
            ], yielding: Peek?.self)
            for try await value in publisher.values {
                if let title = value?.frolic?.plan?.title { return [title] }
                return []
            }
        } catch {
            return []
        }
        return []
    }

    func storeTasteHeadline(groupId: String, headline: String, why: String) async throws {
        guard let client else { throw OnboardingFailure.notConnected }
        try await client.mutation("memory:setMine", with: [
            "deviceToken": OnboardingIdentity.deviceToken,
            "groupId": groupId,
            "headline": headline,
            "why": why,
            "source": "device",
        ])
    }

    func setFreeToday(groupId: String, state: String, window: DateInterval?) async throws {
        guard let client else { throw OnboardingFailure.notConnected }
        var args: [String: ConvexEncodable?] = [
            "deviceToken": OnboardingIdentity.deviceToken,
            "groupId": groupId,
            "day": Self.today(),
            "state": state,
        ]
        if let window {
            args["window"] = [
                "start": Int(window.start.timeIntervalSince1970 * 1000),
                "end": Int(window.end.timeIntervalSince1970 * 1000),
            ] as [String: ConvexEncodable?]
        }
        try await client.mutation("crew:setFree", with: args)
    }

    static func today(_ date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles") ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 2026, parts.month ?? 1, parts.day ?? 1)
    }

    nonisolated static func classify(_ error: Error) -> OnboardingFailure {
        if let failure = error as? OnboardingFailure { return failure }
        if case ClientError.ConvexError(let data) = error {
            let parsed = (try? JSONSerialization.jsonObject(with: Data(data.utf8))) as? [String: Any]
            let code = parsed?["code"] as? String
            let message = parsed?["message"] as? String
            if parsed?["kind"] as? String == "RateLimited" { return .rateLimited }
            switch code {
            case "BAD_INVITE": return .inviteExpired
            case "BAD_NAME": return .name
            case "NOT_A_MEMBER": return .message("You're not in this crew yet.")
            case .some(let other) where other.hasPrefix("BAD_"): return .message(message ?? "That didn't work.")
            default: break
            }
            if let message { return .message(message) }
        }
        if let urlError = error as? URLError, urlError.code == .notConnectedToInternet {
            return .offline
        }
        let text = String(describing: error).lowercased()
        if text.contains("offline") || text.contains("network") || text.contains("connect") {
            return .offline
        }
        return .message("Something got in the way.")
    }
}
