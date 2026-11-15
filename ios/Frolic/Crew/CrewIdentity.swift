import Foundation

struct CrewIdentity: Equatable {
    var deviceToken: String?
    var groupId: String?

    static let tokenKey = "crew.standin.deviceToken"
    static let groupKey = "crew.standin.groupId"

    var isComplete: Bool { !(deviceToken ?? "").isEmpty && !(groupId ?? "").isEmpty }
    var hasToken: Bool { !(deviceToken ?? "").isEmpty }

    static func resolve(route: E2ERoute?) -> CrewIdentity {
        let environment = ProcessInfo.processInfo.environment
        var identity = CrewIdentity(
            deviceToken: environment["FROLIC_DEVICE_TOKEN"],
            groupId: environment["FROLIC_GROUP_ID"]
        )
        #if DEBUG || E2E
        if let token = route?.query["token"], !token.isEmpty {
            identity.deviceToken = token
            identity.groupId = route?.query["group"]
            persist(identity)
        }
        if identity.deviceToken == nil {
            identity.deviceToken = UserDefaults.standard.string(forKey: tokenKey)
        }
        if identity.groupId == nil {
            identity.groupId = UserDefaults.standard.string(forKey: groupKey)
        }
        #endif
        return identity
    }

    #if DEBUG || E2E
    static func persist(_ identity: CrewIdentity) {
        if let token = identity.deviceToken {
            UserDefaults.standard.set(token, forKey: tokenKey)
        }
        if let group = identity.groupId {
            UserDefaults.standard.set(group, forKey: groupKey)
        }
    }
    #endif

    mutating func adopt(groupId: String) {
        guard self.groupId == nil else { return }
        self.groupId = groupId
        #if DEBUG || E2E
        CrewIdentity.persist(self)
        #endif
    }
}
