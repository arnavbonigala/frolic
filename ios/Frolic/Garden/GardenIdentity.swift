import Foundation

struct GardenIdentity: Equatable {
    var deviceToken: String
    var groupId: String

    @MainActor
    static func resolve() -> GardenIdentity? {
        let identity = FrolicIdentity.shared
        identity.refresh()
        guard let group = identity.groupId else { return nil }
        return GardenIdentity(deviceToken: identity.deviceToken, groupId: group)
    }
}
