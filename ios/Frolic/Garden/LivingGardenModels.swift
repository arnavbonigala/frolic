import Foundation

enum GardenHealthState: String, Codable {
    case thriving, fine, thirsty, wilting

    var needsWater: Bool { self == .thirsty || self == .wilting }

    var droop: Double {
        switch self {
        case .thriving, .fine: 0
        case .thirsty: 16
        case .wilting: 34
        }
    }

    var saturation: Double {
        switch self {
        case .thriving: 1.1
        case .fine: 1
        case .thirsty: 0.75
        case .wilting: 0.5
        }
    }

    var flowerScale: Double {
        switch self {
        case .thriving: 1.12
        case .fine: 1
        case .thirsty: 0.94
        case .wilting: 0.86
        }
    }
}

struct GardenHealth: Codable, Hashable {
    let state: GardenHealthState
    let daysSince: Double?
    let line: String?
    let cta: String?

    enum CodingKeys: String, CodingKey { case state, daysSince, line, cta }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? container.decode(GardenHealthState.self, forKey: .state)) ?? .fine
        daysSince = try? container.decodeIfPresent(Double.self, forKey: .daysSince)
        line = try? container.decodeIfPresent(String.self, forKey: .line)
        cta = try? container.decodeIfPresent(String.self, forKey: .cta)
    }

    init(state: GardenHealthState, daysSince: Double? = nil, line: String? = nil, cta: String? = nil) {
        self.state = state
        self.daysSince = daysSince
        self.line = line
        self.cta = cta
    }
}

struct GardenVariety: Codable, Hashable, Identifiable {
    let key: String
    let name: String
    let count: Double?
    let unlocked: Bool
    let hint: String?

    var id: String { key }

    var flowerCount: Int { Int(count ?? 0) }

    var color: FlowerColor {
        let lowered = key.lowercased()
        if lowered.contains("poppy") { return .marigold }
        if lowered.contains("lupine") { return .lilac }
        if lowered.contains("jasmine") { return .cobalt }
        if lowered.contains("sweet") { return .pink }
        if lowered.contains("daisy") { return .moss }
        return .tomato
    }

    enum CodingKeys: String, CodingKey { case key, name, count, unlocked, hint }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        key = try container.decode(String.self, forKey: .key)
        name = try container.decode(String.self, forKey: .name)
        count = try? container.decodeIfPresent(Double.self, forKey: .count)
        unlocked = (try? container.decodeIfPresent(Bool.self, forKey: .unlocked)) ?? false
        hint = try? container.decodeIfPresent(String.self, forKey: .hint)
    }

    init(key: String, name: String, count: Int, unlocked: Bool, hint: String?) {
        self.key = key
        self.name = name
        self.count = Double(count)
        self.unlocked = unlocked
        self.hint = hint
    }
}

struct GardenCollection: Codable, Hashable {
    let varieties: [GardenVariety]

    enum CodingKeys: String, CodingKey { case varieties }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        var list = try container.nestedUnkeyedContainer(forKey: .varieties)
        var items: [GardenVariety] = []
        while !list.isAtEnd {
            if let item = try? list.decode(GardenVariety.self) { items.append(item) } else { _ = try? list.decode(AnyDecodable.self) }
        }
        varieties = items
    }

    init(varieties: [GardenVariety]) { self.varieties = varieties }
}

struct AnyDecodable: Decodable {
    init(from decoder: Decoder) throws {}
}

struct GardenMilestone: Codable, Hashable {
    let reached: String?
    let next: String?
    let nextAt: Double?
    let line: String?

    enum CodingKeys: String, CodingKey { case reached, next, nextAt, line }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        reached = try? container.decodeIfPresent(String.self, forKey: .reached)
        next = try? container.decodeIfPresent(String.self, forKey: .next)
        nextAt = try? container.decodeIfPresent(Double.self, forKey: .nextAt)
        line = try? container.decodeIfPresent(String.self, forKey: .line)
    }

    init(reached: String?, next: String?, nextAt: Double?, line: String?) {
        self.reached = reached
        self.next = next
        self.nextAt = nextAt
        self.line = line
    }
}

struct GardenOnThisDay: Decodable, Hashable {
    let frolicId: String?
    let title: String?
    let line: String?
    let dateLine: String?
    let heroKey: String?
    let photoUrl: String?

    var hasContent: Bool { !(title ?? "").isEmpty || !(line ?? "").isEmpty }

    enum CodingKeys: String, CodingKey { case frolicId, title, line, dateLine, label, heroKey, photoUrl }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        frolicId = try? container.decodeIfPresent(String.self, forKey: .frolicId)
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        line = try? container.decodeIfPresent(String.self, forKey: .line)
        dateLine = (try? container.decodeIfPresent(String.self, forKey: .label)) ?? (try? container.decodeIfPresent(String.self, forKey: .dateLine))
        heroKey = try? container.decodeIfPresent(String.self, forKey: .heroKey)
        photoUrl = try? container.decodeIfPresent(String.self, forKey: .photoUrl)
    }

    init(frolicId: String?, title: String?, line: String?, dateLine: String?, heroKey: String?, photoUrl: String?) {
        self.frolicId = frolicId
        self.title = title
        self.line = line
        self.dateLine = dateLine
        self.heroKey = heroKey
        self.photoUrl = photoUrl
    }
}

extension Notification.Name {
    static let gardenImFree = Notification.Name("frolic.garden.imFree")
}
