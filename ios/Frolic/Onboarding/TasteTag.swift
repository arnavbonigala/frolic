import Foundation

enum TasteTag: String, CaseIterable, Identifiable, Hashable {
    case sunsets
    case outdoors
    case lateNightFood
    case games
    case freeStuff

    var id: String { rawValue }

    var canonical: String {
        switch self {
        case .sunsets: "sunset"
        case .outdoors: "outdoors"
        case .lateNightFood: "late-night-food"
        case .games: "games"
        case .freeStuff: "free-stuff"
        }
    }

    var planTag: String {
        switch self {
        case .sunsets: "sunsets"
        case .outdoors: "outdoors"
        case .lateNightFood: "late_night_food"
        case .games: "games"
        case .freeStuff: "free"
        }
    }

    var label: String {
        switch self {
        case .sunsets: "Sunsets"
        case .outdoors: "Outdoors"
        case .lateNightFood: "Late-night food"
        case .games: "Games"
        case .freeStuff: "Free stuff"
        }
    }

    var identifierSlug: String {
        switch self {
        case .sunsets: "sunsets"
        case .outdoors: "outdoors"
        case .lateNightFood: "late-night-food"
        case .games: "games"
        case .freeStuff: "free-stuff"
        }
    }

    static func from(canonical raw: String) -> TasteTag? {
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "_", with: "-")
        if ["sunset", "sunsets", "golden-hour", "view", "views"].contains(normalized) { return .sunsets }
        if ["outdoors", "outdoor", "nature", "hike", "hiking", "picnic", "beach"].contains(normalized) { return .outdoors }
        if ["late-night-food", "late-night", "latenight", "food", "pizza", "noodles", "dinner"].contains(normalized) { return .lateNightFood }
        if ["games", "game", "bowling", "arcade"].contains(normalized) { return .games }
        if ["free-stuff", "free", "campus", "pier"].contains(normalized) { return .freeStuff }
        return nil
    }

    static func from(classifier identifier: String) -> TasteTag? {
        let words = identifier.lowercased().split(whereSeparator: { $0 == "_" || $0 == "," || $0 == " " || $0 == "-" })
        for word in words {
            switch word {
            case "sunset", "sunrise", "dusk", "sky", "cloud", "golden", "horizon", "evening":
                return .sunsets
            case "outdoor", "outdoors", "nature", "park", "picnic", "grass", "lawn", "field", "tree",
                 "forest", "trail", "hike", "hiking", "mountain", "beach", "water", "ocean", "lake",
                 "marina", "pier", "harbor", "bay", "garden", "climbing", "rock":
                return .outdoors
            case "food", "pizza", "restaurant", "dinner", "meal", "noodle", "burger", "dining",
                 "table", "cafe", "café", "snack", "dessert", "barbecue", "kitchen":
                return .lateNightFood
            case "bowling", "game", "gaming", "arcade", "billiards", "board", "chess", "darts", "sport":
                return .games
            case "campus", "library", "street", "city", "bridge", "architecture", "market", "museum",
                 "building", "downtown":
                return .freeStuff
            default:
                continue
            }
        }
        return nil
    }
}
