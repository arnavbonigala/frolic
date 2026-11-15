import Foundation

struct GardenIdentity: Equatable {
    var deviceToken: String
    var groupId: String

    private static let tokenKey = "frolic.deviceToken"
    private static let groupKey = "frolic.groupId"

    static func resolve(route: E2ERoute?) -> GardenIdentity? {
        if let token = route?.query["token"], let group = route?.query["group"], !token.isEmpty, !group.isEmpty {
            return GardenIdentity(deviceToken: token, groupId: group)
        }
        let environment = ProcessInfo.processInfo.environment
        if let token = environment["FROLIC_DEVICE_TOKEN"], let group = environment["FROLIC_GROUP_ID"],
           !token.isEmpty, !group.isEmpty {
            return GardenIdentity(deviceToken: token, groupId: group)
        }
        let defaults = UserDefaults.standard
        if let token = defaults.string(forKey: tokenKey), let group = defaults.string(forKey: groupKey),
           !token.isEmpty, !group.isEmpty {
            return GardenIdentity(deviceToken: token, groupId: group)
        }
        return nil
    }
}
