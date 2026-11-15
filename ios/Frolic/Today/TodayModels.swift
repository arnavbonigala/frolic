import Foundation
import UIKit

enum TodayPhase: String, Codable, Hashable {
    case none
    case solo
    case open
    case waiting
    case on
    case faded
    case done
}

struct TodayWindow: Codable, Hashable {
    var start: Double
    var end: Double
}

struct TodayPerson: Codable, Hashable, Identifiable {
    var userId: String
    var name: String
    var color: String
    var photoUrl: String?
    var role: String?

    var id: String { userId }

    var flower: FlowerColor { FlowerColor(rawValue: color) ?? .marigold }
}

struct TodayPlace: Codable, Hashable {
    var placeId: String
    var name: String
    var lat: Double
    var lng: Double
    var photoUrl: String?
    var neighborhood: String?
}

struct TodayPlan: Codable, Hashable {
    var title: String
    var line: String
    var why: String?
    var heroKey: String?
    var cost: Double
    var costLabel: String
    var payUpFront: Bool
    var startsAt: Double
    var sunsetAt: Double?
    var place: TodayPlace?
    var chips: [String]?
    var meetSpot: String?
    var tip: String?
}

struct TodayFrolic: Codable, Hashable, Identifiable {
    var frolicId: String
    var day: String
    var kind: String
    var deadline: Double
    var window: TodayWindow
    var durationMinutes: Double
    var plan: TodayPlan?
    var origin: String?
    var notice: String?

    var id: String { frolicId }
    var isSolo: Bool { kind == "solo" }
}

struct TodayTap: Codable, Hashable {
    var kind: String
    var onlyIf: [TodayPerson]
    var window: TodayWindow?
}

struct TodayRevealMe: Codable, Hashable {
    var going: Bool
    var role: String?
    var bloomAt: Double?
    var hopInWaiting: Bool
    var canHopIn: Bool
}

struct TodayReveal: Codable, Hashable {
    var revealAt: Double
    var bloomAt: Double
    var startsAt: Double
    var endsAt: Double
    var snapAt: Double?
    var going: [TodayPerson]
    var me: TodayRevealMe
}

struct TodayView: Codable, Hashable {
    var phase: TodayPhase
    var groupName: String
    var memberCount: Double
    var frolic: TodayFrolic?
    var myTap: TodayTap?
    var reveal: TodayReveal?
    var frolicNumber: Double?
}

struct TodayPayment: Codable, Hashable {
    var state: String
    var kind: String
    var amountCents: Double
    var error: String?
    var paidNames: [String]

    static let idle = TodayPayment(state: "none", kind: "none", amountCents: 0, error: nil, paidNames: [])
}

struct TodayLink: Codable, Hashable {
    var kind: String
    var url: String?
    var amountCents: Double?
    var expiresAt: Double?
    var reason: String?
}

struct TodayDrop: Codable, Hashable {
    var hostedBy: String
    var priceLabel: String?
    var seatsLeft: Double?
}

struct TodayImFreeResult: Codable, Hashable {
    var frolicId: String
    var started: Bool
}

struct TodayShareLink: Codable, Hashable {
    var code: String
    var url: String
}

struct CrewFree: Codable, Hashable {
    var state: String
    var window: TodayWindow?
    var minutesAway: Double?
    var updatedAt: Double?
}

struct CrewMember: Codable, Hashable, Identifiable {
    var userId: String
    var name: String
    var color: String
    var photoUrl: String?
    var isMe: Bool
    var free: CrewFree?

    var id: String { userId }
    var flower: FlowerColor { FlowerColor(rawValue: color) ?? .marigold }
}

struct CrewView: Codable, Hashable {
    var groupName: String
    var members: [CrewMember]
    var holdEnabled: Bool?

    var me: CrewMember? { members.first { $0.isMe } }
    var friendCount: Double { Double(max(members.count - 1, 0)) }
}

struct TodayLimits: Codable, Hashable {
    var budgetCap: Double?
    var energy: String?
    var maxMinutes: Double?
    var homeBy: Double?
}

struct IdentityGroup: Codable, Hashable {
    var groupId: String
    var name: String
    var color: String
}

struct IdentityMe: Codable, Hashable {
    var userId: String
    var name: String
    var photoUrl: String?
    var groups: [IdentityGroup]
}

enum TodayCopy {
    static func names(_ list: [String]) -> String {
        guard let last = list.last else { return "" }
        guard list.count > 1 else { return last }
        return list.dropLast().joined(separator: ", ") + " and " + last
    }

    static func ifIn(_ list: [String]) -> String {
        list.count > 2 ? "all \(list.count)" : names(list)
    }

    static func clock(_ milliseconds: Double) -> String {
        clockFormatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
    }

    static func weekday(_ milliseconds: Double) -> String {
        weekdayFormatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000)).uppercased()
    }

    static func money(cents: Double) -> String {
        let dollars = cents / 100
        if dollars == dollars.rounded() { return "$\(Int(dollars))" }
        return String(format: "$%.2f", dollars)
    }

    static func dayString(_ date: Date = Date()) -> String {
        dayFormatter.string(from: date)
    }


    static func tomorrowString(_ date: Date = Date()) -> String {
        dayFormatter.string(from: date.addingTimeInterval(60 * 60 * 24))
    }

    static func todayAt(hour: Int) -> Double {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let start = calendar.startOfDay(for: Date())
        return start.addingTimeInterval(Double(hour) * 3600).timeIntervalSince1970 * 1000
    }

    static let heroKeywords: [(String, String)] = [
        ("sunset", "plan-sunsets"), ("golden", "plan-sunsets"), ("marina", "plan-sunsets"), ("rock", "plan-sunsets"),
        ("picnic", "plan-outdoors"), ("park", "plan-outdoors"), ("hike", "plan-outdoors"), ("kayak", "plan-outdoors"), ("garden", "plan-outdoors"),
        ("pizza", "plan-late-night-food"), ("food", "plan-late-night-food"), ("noodle", "plan-late-night-food"), ("taco", "plan-late-night-food"), ("cheese", "plan-late-night-food"),
        ("bowling", "plan-games"), ("game", "plan-games"), ("arcade", "plan-games"),
    ]

    static func heroAsset(_ plan: TodayPlan?) -> String {
        if let key = plan?.heroKey, UIImage(named: key) != nil { return key }
        let text = ((plan?.title ?? "") + " " + (plan?.place?.name ?? "")).lowercased()
        if let match = heroKeywords.first(where: { text.contains($0.0) }), UIImage(named: match.1) != nil { return match.1 }
        return "plan-free-stuff"
    }

    static func shortClock(_ milliseconds: Double) -> String {
        let text = clock(milliseconds)
        return text.hasSuffix(":00") ? String(text.dropLast(3)) : text
    }

    static func walkMinutes(plan: TodayPlan?, minutesAway: Double?, from: (Double, Double)?) -> Double? {
        if let minutesAway, minutesAway > 0 { return minutesAway }
        guard let place = plan?.place, let from else { return nil }
        let dLat = (place.lat - from.0) * 111_000
        let dLng = (place.lng - from.1) * 111_000 * cos(from.0 * .pi / 180)
        return max(1, (sqrt(dLat * dLat + dLng * dLng) * 1.3 / 80).rounded())
    }

    static func chips(plan: TodayPlan?, walk: Double?) -> [String] {
        guard let plan else { return [] }
        if let chips = plan.chips, !chips.isEmpty { return chips }
        var chips = [plan.costLabel]
        if let walk {
            chips.append("\(Int(walk)) min walk")
        }
        if let sunset = plan.sunsetAt {
            chips.append("Golden hour " + clock(sunset - 30 * 60 * 1000))
        }
        return chips
    }

    static func meetPlace(_ plan: TodayPlan?) -> String {
        guard let plan else { return "" }
        return plan.meetSpot ?? plan.place?.name ?? plan.title
    }

    static func freeLabel(_ free: CrewFree?) -> String {
        guard let free else { return "When are you free?" }
        switch free.state {
        case "now":
            if let end = free.window?.end { return "Free till \(shortClock(end))" }
            return "Free now"
        case "window":
            if let window = free.window { return "Free \(shortClock(window.start)) to \(shortClock(window.end))" }
            return "Free today"
        case "busy":
            return "Not today"
        default:
            return "When are you free?"
        }
    }

    static func downLine(_ onlyIf: [String]) -> String {
        onlyIf.isEmpty ? "You're down" : "You're down, if \(ifIn(onlyIf))"
    }

    static func downBody(_ onlyIf: [String], deadline: Double?) -> String {
        "Disappears at \(deadline.map { shortClock($0) } ?? "4") if nobody joins."
    }

    static let zone = TimeZone(identifier: "America/Los_Angeles") ?? .current

    static let clockFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "h:mm"
        return formatter
    }()

    static let weekdayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "EEEE"
        return formatter
    }()

    static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

