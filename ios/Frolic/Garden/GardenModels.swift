import Foundation

struct GardenPerson: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let color: FlowerColor
    let photoUrl: String?

    var id: String { userId }

    var flower: FlowerPerson { FlowerPerson(id: userId, name: name, color: color) }
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

    static func withYou(_ names: [String]) -> String {
        names.isEmpty ? "you" : "you and \(line(names))"
    }
}

struct GardenMemoryRow: Decodable, Hashable, Identifiable {
    let frolicId: String
    let title: String
    let dateLine: String
    let heroKey: String?
    let photoUrl: String?
    let youWent: Bool
    let going: [GardenPerson]

    var id: String { frolicId }

    var namesLine: String {
        let names = going.map(\.name)
        return youWent ? GardenNames.withYou(names) : GardenNames.line(names)
    }

    var subtitle: String { "\(dateLine) · \(namesLine)" }
}

struct GardenTasteLine: Decodable, Hashable {
    let headline: String
    let why: String
}

struct GardenFundLine: Decodable, Hashable {
    let line: String
    let frolicTitle: String
}

struct GardenOverview: Decodable, Hashable {
    let groupName: String
    let youWent: Bool
    let count: Double
    let sinceLine: String
    let weekLine: String
    let taste: GardenTasteLine?
    let fund: GardenFundLine?
    let memories: [GardenMemoryRow]

    var flowerCount: Int { Int(count) }

    var countLine: String { flowerCount == 1 ? "1 frolic" : "\(flowerCount) frolics" }

    var subtitle: String {
        let base = "Every frolic grows a flower. It never wilts."
        guard !youWent, flowerCount > 0 else { return base }
        return "\(base) \(groupName) grew these before you joined."
    }

    var isEmpty: Bool { memories.isEmpty }
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
