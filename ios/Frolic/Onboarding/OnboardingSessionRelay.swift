import Foundation

protocol OnboardingSessionStoring {
    func store(deviceToken: String, groupId: String)
}

struct AppGroupSessionStore: OnboardingSessionStoring {
    func store(deviceToken: String, groupId: String) {
        let defaults = AppGroup.defaults
        defaults.set(deviceToken, forKey: "session.deviceToken")
        defaults.set(groupId, forKey: "session.groupId")
    }
}

enum OnboardingSessionRelay {
    nonisolated(unsafe) static var store: OnboardingSessionStoring = AppGroupSessionStore()

    static func store(deviceToken: String, groupId: String) {
        guard !groupId.isEmpty else { return }
        store.store(deviceToken: deviceToken, groupId: groupId)
    }
}
