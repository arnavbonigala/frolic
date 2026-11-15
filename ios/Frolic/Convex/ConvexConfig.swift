import Foundation

enum ConvexConfig {
    static let urlEnvironmentKey = "FROLIC_CONVEX_URL"
    static let siteEnvironmentKey = "FROLIC_CONVEX_SITE_URL"
    static let urlInfoKey = "ConvexDeploymentURL"

    static var deploymentURL: String? {
        validated(ProcessInfo.processInfo.environment[urlEnvironmentKey])
            ?? validated(Bundle.main.object(forInfoDictionaryKey: urlInfoKey) as? String)
    }

    static var siteURL: String? {
        if let site = validated(ProcessInfo.processInfo.environment[siteEnvironmentKey]) {
            return site
        }
        guard let deploymentURL, deploymentURL.contains(".convex.cloud") else { return nil }
        return deploymentURL.replacingOccurrences(of: ".convex.cloud", with: ".convex.site")
    }

    static func validated(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              value.hasPrefix("https://") || value.hasPrefix("http://"),
              let url = URL(string: value),
              url.host != nil
        else { return nil }
        return value
    }
}
