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
    var memberCount: Double
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
        case .inviteExpired: "Ask for a fresh link."
        case .inviteUnknown: "Check the link, or start your own crew."
        case .name: "First names top out at 40 characters."
        case .rateLimited: "Give it a minute."
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
            return try await withThrowingTaskGroup(of: InvitePreview?.self) { group in
                group.addTask {
                    for try await value in publisher.values {
                        return value
                    }
                    return nil
                }
                group.addTask {
                    try await Task.sleep(nanoseconds: 8_000_000_000)
                    throw OnboardingFailure.offline
                }
                defer { group.cancelAll() }
                guard let first = try await group.next(), let preview = first else { throw OnboardingFailure.inviteUnknown }
                return preview
            }
        } catch let failure as OnboardingFailure {
            throw failure
        } catch {
            throw Self.classify(error)
        }
    }

    func rename(firstName: String) async throws {
        guard let client else { throw OnboardingFailure.notConnected }
        do {
            try await client.mutation("users:updateProfile", with: [
                "deviceToken": OnboardingIdentity.deviceToken,
                "firstName": firstName,
            ])
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
                "groupName": Self.crewName(for: firstName),
            ])
            return outcome
        } catch {
            throw Self.classify(error)
        }
    }

    static func crewName(for firstName: String) -> String {
        let suffix = "'s crew"
        var base = ""
        var units = 0
        for character in firstName {
            let width = String(character).utf16.count
            guard units + width + suffix.utf16.count <= OnboardingModel.nameLimit else { break }
            units += width
            base.append(character)
        }
        return base + suffix
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

    func existingMembership() async -> String? {
        guard let client else { return nil }
        struct Me: Decodable {
            struct Group: Decodable { var groupId: String }
            var groups: [Group]
        }
        do {
            let publisher = client.subscribe(to: "users:me", with: ["deviceToken": OnboardingIdentity.deviceToken], yielding: Me?.self)
            return try await withThrowingTaskGroup(of: String?.self) { group in
                group.addTask {
                    for try await value in publisher.values {
                        return value?.groups.first?.groupId
                    }
                    return nil
                }
                group.addTask {
                    try await Task.sleep(nanoseconds: 4_000_000_000)
                    return nil
                }
                defer { group.cancelAll() }
                return try await group.next() ?? nil
            }
        } catch {
            return nil
        }
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
                "start": window.start.timeIntervalSince1970 * 1000,
                "end": window.end.timeIntervalSince1970 * 1000,
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
