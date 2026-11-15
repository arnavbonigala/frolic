import Foundation

enum ReachableURL {
    static func from(_ raw: String?) -> URL? {
        guard let raw, var components = URLComponents(string: raw) else { return nil }
        guard let host = components.host, host == "127.0.0.1" || host == "localhost" else { return components.url }
        let base = components.port == 3211 ? ConvexConfig.siteURL : ConvexConfig.deploymentURL
        guard let base, let origin = URLComponents(string: base) else { return components.url }
        components.scheme = origin.scheme
        components.host = origin.host
        components.port = origin.port
        return components.url
    }
}
