import Foundation

struct GardenPerson: Codable, Hashable, Identifiable {
    let userId: String
    let name: String
    let color: FlowerColor
    let photoUrl: String?

    var id: String { userId }

    var flower: FlowerPerson { FlowerPerson(id: userId, name: name, color: color, photoUrl: photoUrl) }
}

enum GardenNames {
    static func line(_ names: [String]) -> String {
        switch names.count {
        case 0: ""
        case 1: names[0]
        case 2: "\(names[0]) and \(names[1])"
        default: "\(names.dropLast().joined(separator: ", ")) and \(names[names.count - 1])"
        }
    }
}

struct GardenMemoryRow: Codable, Hashable, Identifiable {
    let frolicId: String
    let title: String
    let dateLine: String
    let heroKey: String?
    let photoUrl: String?
    let youWent: Bool
    let going: [GardenPerson]

    var id: String { frolicId }

    func namesLine(me: String?) -> String {
        let others = going.filter { $0.userId != me }.map(\.name)
        guard youWent, me != nil else { return GardenNames.line(going.map(\.name)) }
        return others.isEmpty ? "you" : "you and " + GardenNames.line(others)
    }

    func subtitle(me: String?) -> String { "\(dateLine) · \(namesLine(me: me))" }
}

struct GardenTasteLine: Codable, Hashable {
    let headline: String
    let why: String
}

struct GardenFundLine: Codable, Hashable {
    let line: String
    let frolicTitle: String
}

struct GardenOverview: Codable, Hashable {
    let groupName: String
    let youWent: Bool
    let count: Double
    let sinceLine: String
    let weekLine: String
    let taste: GardenTasteLine?
    let fund: GardenFundLine?
    let memories: [GardenMemoryRow]
    var health: GardenHealth? = nil
    var collection: GardenCollection? = nil
    var milestone: GardenMilestone? = nil

    enum CodingKeys: String, CodingKey {
        case groupName, youWent, count, sinceLine, weekLine, taste, fund, memories, health, collection, milestone
    }

    init(groupName: String, youWent: Bool, count: Double, sinceLine: String, weekLine: String, taste: GardenTasteLine?, fund: GardenFundLine?, memories: [GardenMemoryRow], health: GardenHealth? = nil, collection: GardenCollection? = nil, milestone: GardenMilestone? = nil) {
        self.groupName = groupName
        self.youWent = youWent
        self.count = count
        self.sinceLine = sinceLine
        self.weekLine = weekLine
        self.taste = taste
        self.fund = fund
        self.memories = memories
        self.health = health
        self.collection = collection
        self.milestone = milestone
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        groupName = try c.decode(String.self, forKey: .groupName)
        youWent = try c.decode(Bool.self, forKey: .youWent)
        count = try c.decode(Double.self, forKey: .count)
        sinceLine = try c.decode(String.self, forKey: .sinceLine)
        weekLine = try c.decode(String.self, forKey: .weekLine)
        taste = try? c.decodeIfPresent(GardenTasteLine.self, forKey: .taste)
        fund = try? c.decodeIfPresent(GardenFundLine.self, forKey: .fund)
        memories = try c.decode([GardenMemoryRow].self, forKey: .memories)
        health = try? c.decodeIfPresent(GardenHealth.self, forKey: .health)
        collection = try? c.decodeIfPresent(GardenCollection.self, forKey: .collection)
        milestone = try? c.decodeIfPresent(GardenMilestone.self, forKey: .milestone)
    }

    var flowerCount: Int { Int(count) }

    var cleanSinceLine: String {
        sinceLine.hasPrefix("0 before you, ") ? String(sinceLine.dropFirst("0 before you, ".count)) : sinceLine
    }

    var countLine: String { flowerCount == 1 ? "1 frolic" : "\(flowerCount) frolics" }

    var subtitle: String {
        let base = "Every frolic grows a flower. It never wilts."
        guard !youWent, flowerCount > 0 else { return base }
        return "\(base) \(groupName) grew these before you joined."
    }

    var isEmpty: Bool { memories.isEmpty }

    func yourFlower(me: String?) -> GardenPerson? {
        guard let me else { return nil }
        return memories.compactMap { row in row.going.first { $0.userId == me } }.first
    }
}

struct GardenPlace: Decodable, Hashable {
    let name: String
    let heroKey: String?
}

struct GardenPhoto: Decodable, Hashable, Identifiable {
    let url: String
    let caption: String?
    let heroKey: String?

    var id: String { url.isEmpty ? (heroKey ?? caption ?? "photo") : url }
}

struct GardenMemory: Decodable, Hashable, Identifiable {
    let frolicId: String
    let title: String
    let dateLine: String
    let caption: String?
    let heroKey: String?
    let place: GardenPlace?
    let fundLine: String?
    let going: [GardenPerson]
    let photos: [GardenPhoto]

    var id: String { frolicId }

    var namesLine: String { GardenNames.line(going.map(\.name)) }
}
