import Foundation

enum YouPreferences {
    enum Key {
        static let limits = "you.limits"
        static let card = "you.card"
        static let readCalendar = "you.readCalendar"
        static let dropTime = "you.dropTime"
        static let tasteTags = "you.tasteTags"
    }

    static var readCalendar: Bool {
        get {
            guard AppGroup.defaults.object(forKey: Key.readCalendar) != nil else { return true }
            return AppGroup.defaults.bool(forKey: Key.readCalendar)
        }
        set { AppGroup.defaults.set(newValue, forKey: Key.readCalendar) }
    }

    static var dropTime: Int {
        get {
            guard AppGroup.defaults.object(forKey: Key.dropTime) != nil else { return 15 }
            return AppGroup.defaults.integer(forKey: Key.dropTime)
        }
        set { AppGroup.defaults.set(newValue, forKey: Key.dropTime) }
    }

    static var tasteTags: [String] {
        get { AppGroup.defaults.stringArray(forKey: Key.tasteTags) ?? [] }
        set { AppGroup.defaults.set(newValue, forKey: Key.tasteTags) }
    }

    static func cachedLimits() -> YouLimits? {
        guard let data = AppGroup.defaults.data(forKey: Key.limits) else { return nil }
        return try? JSONDecoder().decode(YouLimits.self, from: data)
    }

    static func cachedCard() -> YouCard {
        guard let data = AppGroup.defaults.data(forKey: Key.card),
              let card = try? JSONDecoder().decode(YouCard.self, from: data)
        else { return .none }
        return card
    }

    static func save(limits: YouLimits) {
        guard let data = try? JSONEncoder().encode(limits) else { return }
        AppGroup.defaults.set(data, forKey: Key.limits)
    }

    static func save(card: YouCard) {
        guard let data = try? JSONEncoder().encode(card) else { return }
        AppGroup.defaults.set(data, forKey: Key.card)
    }

    static func save(limits: YouLimits, card: YouCard) {
        save(limits: limits)
        save(card: card)
    }

    static func clearAll() {
        for key in [Key.limits, Key.card, Key.tasteTags] {
            AppGroup.defaults.removeObject(forKey: key)
        }
        UserDefaults.standard.removeObject(forKey: YouIdentity.groupDefaultsKey)
        UserDefaults.standard.removeObject(forKey: YouIdentity.tokenDefaultsKey)
    }
}

struct YouLimits: Codable, Equatable {
    var budgetCap: Double?
    var energy: YouEnergy?
    var maxMinutes: Double?
    var homeBy: Double?

    static let unset = YouLimits(budgetCap: nil, energy: nil, maxMinutes: nil, homeBy: nil)
}

enum YouEnergy: String, Codable, Equatable {
    case chill
    case anything
}

enum YouBudget: Int, CaseIterable, Equatable {
    case free
    case ten
    case twentyFive
    case any

    var label: String {
        switch self {
        case .free: "Free"
        case .ten: "$10"
        case .twentyFive: "$25"
        case .any: "Any"
        }
    }

    var identifier: String {
        switch self {
        case .free: "you.budget.free"
        case .ten: "you.budget.ten"
        case .twentyFive: "you.budget.twentyFive"
        case .any: "you.budget.any"
        }
    }

    var cap: Double? {
        switch self {
        case .free: 0
        case .ten: 10
        case .twentyFive: 25
        case .any: nil
        }
    }

    static func from(_ cap: Double?) -> YouBudget {
        guard let cap else { return .any }
        if cap <= 0 { return .free }
        if cap <= 17.5 { return .ten }
        if cap <= 40 { return .twentyFive }
        return .any
    }
}

enum YouEnergyChoice: Int, CaseIterable, Equatable {
    case chill
    case anything

    var label: String {
        switch self {
        case .chill: "Chill"
        case .anything: "Down for anything"
        }
    }

    var identifier: String {
        switch self {
        case .chill: "you.energy.chill"
        case .anything: "you.energy.anything"
        }
    }

    var stored: YouEnergy {
        switch self {
        case .chill: .chill
        case .anything: .anything
        }
    }

    static func from(_ energy: YouEnergy?) -> YouEnergyChoice {
        energy == .anything ? .anything : .chill
    }
}

enum YouHomeBy: Int, CaseIterable, Equatable {
    case ninePM = 1260
    case tenPM = 1320
    case elevenPM = 1380
    case midnight = 1440
    case whenever = 0

    var label: String {
        switch self {
        case .ninePM: "9 PM"
        case .tenPM: "10 PM"
        case .elevenPM: "11 PM"
        case .midnight: "Midnight"
        case .whenever: "Whenever"
        }
    }

    var minutes: Double? {
        switch self {
        case .whenever: nil
        default: Double(rawValue)
        }
    }

    static func from(_ minutes: Double?) -> YouHomeBy {
        guard let minutes else { return .whenever }
        let ordered: [YouHomeBy] = [.ninePM, .tenPM, .elevenPM, .midnight, .whenever]
        return ordered.min { lhs, rhs in
            distance(lhs, minutes) < distance(rhs, minutes)
        } ?? .elevenPM
    }

    private static func distance(_ option: YouHomeBy, from minutes: Double) -> Double {
        guard let value = option.minutes else { return abs(1440 - minutes) }
        return abs(value - minutes)
    }

    private static func distance(_ option: YouHomeBy, _ minutes: Double) -> Double {
        distance(option, from: minutes)
    }
}

enum YouDropTime: Int, CaseIterable, Equatable {
    case noon = 12
    case twoPM = 14
    case threePM = 15
    case fourPM = 16

    var label: String {
        switch self {
        case .noon: "Noon"
        case .twoPM: "2 PM"
        case .threePM: "3 PM"
        case .fourPM: "4 PM"
        }
    }

    static func from(_ hour: Int) -> YouDropTime {
        YouDropTime(rawValue: hour) ?? .threePM
    }
}
