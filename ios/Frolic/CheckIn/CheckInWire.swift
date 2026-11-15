import Foundation

struct WireMe: Codable, Hashable {
    var userId: String
    var name: String
    var photoUrl: String?
    var groups: [WireMembership]
}

struct WireMembership: Codable, Hashable {
    var groupId: String
    var name: String
    var color: String
    var joinedAt: Double?
}

struct WireWindow: Codable, Hashable {
    var start: Double
    var end: Double
}

struct WirePerson: Codable, Identifiable, Hashable {
    var userId: String
    var name: String
    var color: String
    var photoUrl: String?
    var role: String?

    var id: String { userId }

    var flower: FlowerColor { FlowerColor(rawValue: color) ?? .lilac }
}

struct WirePlace: Codable, Hashable {
    var placeId: String
    var name: String
    var lat: Double
    var lng: Double
    var photoUrl: String?
    var neighborhood: String?
}

struct WirePlan: Codable, Hashable {
    var title: String
    var line: String
    var why: String?
    var cost: Double
    var costLabel: String
    var payUpFront: Bool
    var heroKey: String?
    var startsAt: Double
    var sunsetAt: Double?
    var place: WirePlace?
}

struct WireFrolic: Codable, Hashable {
    var frolicId: String
    var day: String
    var kind: String
    var deadline: Double
    var window: WireWindow
    var durationMinutes: Double
    var plan: WirePlan?
}

struct WireReveal: Codable, Hashable {
    var revealAt: Double
    var bloomAt: Double
    var startsAt: Double
    var endsAt: Double
    var snapAt: Double?
    var going: [WirePerson]
    var me: WireMeState
}

struct WireMeState: Codable, Hashable {
    var going: Bool
    var role: String?
    var bloomAt: Double?
    var hopInWaiting: Bool
    var canHopIn: Bool
}

struct WireToday: Codable, Hashable {
    var phase: String
    var groupName: String
    var memberCount: Double
    var frolic: WireFrolic?
    var reveal: WireReveal?
}

struct WireEta: Codable, Hashable {
    var userId: String
    var minutes: Double
    var onTheWay: Bool
    var updatedAt: Double
}

struct WireMoney: Codable, Hashable {
    var state: String
    var kind: String
    var amountCents: Double
    var error: String?
    var paidNames: [String]

    static let none = WireMoney(state: "none", kind: "none", amountCents: 0, error: nil, paidNames: [])

    var dollars: String {
        let value = Double(amountCents) / 100
        return value == value.rounded() ? "$\(Int(value))" : String(format: "$%.2f", value)
    }
}

struct WireSnap: Codable, Hashable {
    var userId: String
    var url: String?
    var takenAt: Double
    var mine: Bool
}
