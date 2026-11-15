import ConvexMobile
import Foundation
import Observation

enum BackendError: LocalizedError {
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Frolic isn't connected to a server yet."
        }
    }
}

@MainActor
@Observable
final class FrolicBackend {
    static let shared = FrolicBackend()

    let deploymentURL: String?
    let client: ConvexClient?

    init(deploymentURL: String? = ConvexConfig.deploymentURL) {
        self.deploymentURL = deploymentURL
        client = deploymentURL.map { ConvexClient(deploymentUrl: $0) }
    }

    var isConfigured: Bool { client != nil }

    func requireClient() throws -> ConvexClient {
        guard let client else { throw BackendError.notConfigured }
        return client
    }
}
