import Foundation

struct CrewPersonWire: Decodable, Hashable {
    let userId: String
    let name: String
    let color: String
    let photoUrl: String?

    var flowerColor: FlowerColor { FlowerColor(rawValue: color) ?? .marigold }
}

struct CrewWindow: Decodable, Hashable {
    let start: Double
    let end: Double
}

struct CrewFreeWire: Decodable, Hashable {
    let state: String
    let window: CrewWindow?
    let minutesAway: Double?
    let updatedAt: Double?
}

struct CrewMemberWire: Decodable, Identifiable, Hashable {
    let userId: String
    let name: String
    let color: String
    let photoUrl: String?
    let isMe: Bool
    let free: CrewFreeWire?

    var id: String { userId }
    var flowerColor: FlowerColor { FlowerColor(rawValue: color) ?? .marigold }

    func with(free: CrewFreeWire) -> CrewMemberWire {
        CrewMemberWire(userId: userId, name: name, color: color, photoUrl: photoUrl, isMe: isMe, free: free)
    }
}

struct CrewWire: Decodable {
    let groupName: String
    let members: [CrewMemberWire]
    let memberCount: Double?
    let createdAt: Double?
    let holdEnabled: Bool?
    let holdCents: Double?
}

struct CrewMeWire: Decodable {
    struct Group: Decodable {
        let groupId: String
        let name: String
    }

    let userId: String
    let name: String
    let photoUrl: String?
    let groups: [Group]
}

struct CrewPlanWire: Decodable {
    let title: String
    let costLabel: String?
    let startsAt: Double?
}

struct CrewFrolicWire: Decodable {
    let day: String
    let plan: CrewPlanWire?
    let startsAt: Double?
}

struct CrewRevealWire: Decodable {
    let startsAt: Double?
    let endsAt: Double?
    let going: [CrewPersonWire]?
    let me: Me?

    struct Me: Decodable {
        let going: Bool
    }
}

struct CrewTodayWire: Decodable {
    let phase: String
    let groupName: String?
    let memberCount: Double?
    let frolic: CrewFrolicWire?
    let reveal: CrewRevealWire?
}

struct FundEntryWire: Decodable, Identifiable {
    let amountCents: Double
    let line: String
    let at: Double
    let frolicId: String?

    var id: String { "\(at)-\(line)-\(amountCents)" }
}

struct FundWire: Decodable {
    let balanceCents: Double
    let entries: [FundEntryWire]
}

struct LookingWire: Decodable {
    let userId: String
    let online: Bool
    let lastDisconnected: Double?
}

struct HeartbeatWire: Decodable {
    let roomToken: String
    let sessionToken: String
}
