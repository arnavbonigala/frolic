import Foundation

enum FrolicAPIError: LocalizedError, Equatable {
    case signedOut
    case offline
    case server(code: String, message: String)
    case rateLimited
    case unreadable

    var errorDescription: String? {
        switch self {
        case .signedOut: "Open Frolic to join your crew."
        case .offline: "You're offline. Frolic will catch up when you're back."
        case .server(_, let message): message
        case .rateLimited: "Easy there. Try again in a minute."
        case .unreadable: "Frolic couldn't read the server's answer."
        }
    }
}

struct FrolicHTTP {
    var deploymentURL: String
    var session: URLSession = .shared

    static func current() throws -> FrolicHTTP {
        guard let url = SharedSession.deploymentURL else { throw FrolicAPIError.signedOut }
        return FrolicHTTP(deploymentURL: url)
    }

    func query<T: Decodable>(_ path: String, _ args: [String: Any], as type: T.Type) async throws -> T {
        try await call("query", path, args, as: type)
    }

    func mutation<T: Decodable>(_ path: String, _ args: [String: Any], as type: T.Type) async throws -> T {
        try await call("mutation", path, args, as: type)
    }

    func mutation(_ path: String, _ args: [String: Any]) async throws {
        _ = try await call("mutation", path, args, as: Nothing.self)
    }

    private struct Envelope<T: Decodable>: Decodable {
        var status: String
        var value: T?
        var errorMessage: String?
        var errorData: ErrorData?
    }

    private struct ErrorData: Decodable {
        var code: String?
        var message: String?
        var kind: String?
    }

    private func call<T: Decodable>(_ kind: String, _ path: String, _ args: [String: Any], as type: T.Type) async throws -> T {
        guard let url = URL(string: deploymentURL)?.appending(path: "api/\(kind)") else {
            throw FrolicAPIError.signedOut
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["path": path, "args": args, "format": "json"])
        let data: Data
        do {
            (data, _) = try await session.data(for: request)
        } catch let error as URLError where Self.offlineCodes.contains(error.code) {
            throw FrolicAPIError.offline
        }
        guard let envelope = try? JSONDecoder().decode(Envelope<T>.self, from: data) else {
            throw FrolicAPIError.unreadable
        }
        if envelope.status == "success" {
            if let value = envelope.value { return value }
            if let empty = Nothing() as? T { return empty }
            throw FrolicAPIError.unreadable
        }
        if envelope.errorData?.kind == "RateLimited" { throw FrolicAPIError.rateLimited }
        throw FrolicAPIError.server(
            code: envelope.errorData?.code ?? "UNKNOWN",
            message: envelope.errorData?.message ?? "Something went wrong on Frolic's side."
        )
    }

    private static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff, .cannotFindHost, .cannotConnectToHost, .timedOut,
    ]
}

struct Nothing: Decodable {
    init() {}
    init(from decoder: Decoder) throws {}
}
