import Foundation

struct CrewIdentity: Equatable {
    var deviceToken: String?
    var groupId: String?

    var hasToken: Bool { !(deviceToken ?? "").isEmpty }

    @MainActor
    static func resolve(route: E2ERoute?) -> CrewIdentity {
        let shared = FrolicIdentity.shared
        shared.refresh()
        return CrewIdentity(deviceToken: shared.deviceToken, groupId: shared.groupId)
    }

    @MainActor
    mutating func adopt(groupId: String) {
        guard self.groupId == nil else { return }
        self.groupId = groupId
        FrolicIdentity.shared.setGroup(groupId)
    }
}
