import Foundation

enum YouPreferences {
    enum Key {
        static let limits = "you.limits"
        static let card = "you.card"
        static let profile = "you.profile"
        static let readCalendar = "you.readCalendar"
        static let tasteTags = "you.tasteTags"
        static let totals = "you.totals"
    }

    static var readCalendar: Bool {
        get {
            guard AppGroup.defaults.object(forKey: Key.readCalendar) != nil else { return true }
            return AppGroup.defaults.bool(forKey: Key.readCalendar)
        }
        set { AppGroup.defaults.set(newValue, forKey: Key.readCalendar) }
    }

    static var tasteTags: [String] {
        get { AppGroup.defaults.stringArray(forKey: Key.tasteTags) ?? [] }
        set { AppGroup.defaults.set(newValue, forKey: Key.tasteTags) }
    }

    static func cachedLimits() -> YouLimits? {
        guard let data = AppGroup.defaults.data(forKey: Key.limits) else { return nil }
        return try? JSONDecoder().decode(YouLimits.self, from: data)
    }

    static func cachedProfile() -> YouProfile? {
        guard let data = AppGroup.defaults.data(forKey: Key.profile) else { return nil }
        return try? JSONDecoder().decode(YouProfile.self, from: data)
    }

    static func save(profile: YouProfile?) {
        guard let profile, let data = try? JSONEncoder().encode(profile) else {
            AppGroup.defaults.removeObject(forKey: Key.profile)
            return
        }
        AppGroup.defaults.set(data, forKey: Key.profile)
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

    static func cachedTotals() -> YouTotals? {
        guard let data = AppGroup.defaults.data(forKey: Key.totals) else { return nil }
        return try? JSONDecoder().decode(YouTotals.self, from: data)
    }

    static func save(totals: YouTotals) {
        guard let data = try? JSONEncoder().encode(totals) else { return }
        AppGroup.defaults.set(data, forKey: Key.totals)
    }

    static func save(limits: YouLimits, card: YouCard) {
        save(limits: limits)
        save(card: card)
    }

    @MainActor
    static func clearAll() {
        for key in [Key.limits, Key.card, Key.profile, Key.tasteTags, Key.totals] {
            AppGroup.defaults.removeObject(forKey: key)
        }
        FrolicIdentity.shared.setGroup(nil)
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

    var cap: Double {
        switch self {
        case .free: 0
        case .ten: 10
        case .twentyFive: 25
        case .any: 10000
        }
    }

    static func from(_ cap: Double?) -> YouBudget? {
        guard let cap else { return nil }
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

    static func from(_ energy: YouEnergy?) -> YouEnergyChoice? {
        switch energy {
        case .chill: .chill
        case .anything: .anything
        case nil: nil
        }
    }
}

enum YouHomeBy: Int, CaseIterable, Equatable {
    case ninePM = 1260
    case tenPM = 1320
    case elevenPM = 1380
    case midnight = 1440
    case whenever = 2160

    var label: String {
        switch self {
        case .ninePM: "9 PM"
        case .tenPM: "10 PM"
        case .elevenPM: "11 PM"
        case .midnight: "Midnight"
        case .whenever: "Whenever"
        }
    }

    var minutes: Double {
        switch self {
        case .whenever: 2160
        default: Double(rawValue)
        }
    }

    static func from(_ minutes: Double?) -> YouHomeBy? {
        guard let minutes else { return nil }
        let ordered: [YouHomeBy] = [.ninePM, .tenPM, .elevenPM, .midnight, .whenever]
        return ordered.min { abs($0.minutes - minutes) < abs($1.minutes - minutes) }
    }
}
