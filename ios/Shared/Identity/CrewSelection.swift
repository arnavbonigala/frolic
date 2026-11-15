import Foundation

enum CrewSelection {
    struct Candidate: Equatable {
        var groupId: String
        var joinedAt: Double
    }

    static func choose(pinned: String?, persisted: String?, memberships: [Candidate]) -> String? {
        if let pinned = trimmed(pinned) { return pinned }
        if let persisted = trimmed(persisted), memberships.contains(where: { $0.groupId == persisted }) {
            return persisted
        }
        var newest: Candidate?
        for candidate in memberships {
            if let current = newest, candidate.joinedAt < current.joinedAt { continue }
            newest = candidate
        }
        return newest?.groupId
    }

    private static func trimmed(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
