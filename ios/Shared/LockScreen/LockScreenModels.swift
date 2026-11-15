import Foundation

struct APIPerson: Decodable, Hashable {
    var userId: String
    var name: String
    var color: String
    var photoUrl: String?
}

struct APIWindow: Decodable, Hashable {
    var start: Double
    var end: Double
}

struct TodayResponse: Decodable {
    struct Frolic: Decodable {
        var frolicId: String
        var day: String
        var kind: String
        var deadline: Double
        var window: APIWindow
        var durationMinutes: Double
        var notice: String?
        var plan: Plan?
    }

    struct Plan: Decodable {
        var title: String
        var line: String
        var costLabel: String?
        var startsAt: Double
        var sunsetAt: Double?
        var heroKey: String?
        var place: Place?
    }

    struct Place: Decodable {
        var name: String
        var lat: Double
        var lng: Double
    }

    struct Tap: Decodable {
        var kind: String
        var onlyIf: [APIPerson]
    }

    struct GoingPerson: Decodable {
        var userId: String
        var name: String
        var color: String
        var photoUrl: String?
        var role: String
    }

    struct Me: Decodable {
        var going: Bool
        var bloomAt: Double?
        var hopInWaiting: Bool
        var canHopIn: Bool
    }

    struct Reveal: Decodable {
        var revealAt: Double
        var bloomAt: Double
        var startsAt: Double
        var endsAt: Double
        var going: [GoingPerson]
        var me: Me
    }

    var phase: String
    var groupName: String
    var memberCount: Double
    var frolic: Frolic?
    var myTap: Tap?
    var reveal: Reveal?
}

struct CrewResponse: Decodable {
    struct Free: Decodable {
        var state: String
    }

    struct Member: Decodable {
        var userId: String
        var name: String
        var color: String
        var photoUrl: String?
        var isMe: Bool
        var free: Free?
    }

    var groupName: String
    var members: [Member]
}

struct EtaRow: Decodable {
    var userId: String
    var minutes: Double
    var onTheWay: Bool
}

struct MeResponse: Decodable {
    var userId: String
    var name: String
}

struct LockScreenPerson: Codable, Hashable, Identifiable {
    var id: String
    var name: String
    var color: FlowerColor
    var photoUrl: String?

    var flowerPerson: FlowerPerson { FlowerPerson(id: id, name: name, color: color) }
}

enum LockScreenPhase: String, Codable {
    case none, solo, open, waiting, on, faded, done
}

struct LockScreenSnapshot: Codable, Equatable {
    var fetchedAt: Date
    var phase: LockScreenPhase
    var groupName: String
    var frolicId: String?
    var day: String?
    var planTitle: String?
    var placeName: String?
    var placeLat: Double?
    var placeLng: Double?
    var heroKey: String
    var startsAt: Date?
    var endsAt: Date?
    var sunsetAt: Date?
    var deadline: Date?
    var costLabel: String?
    var me: LockScreenPerson?
    var free: [LockScreenPerson]
    var going: [LockScreenPerson]
    var onlyIf: [String]
    var tookDayOff: Bool
    var tappedDown: Bool
    var revealAt: Date?
    var amGoing: Bool
    var canHopIn: Bool
    var hopInWaiting: Bool

    var isRevealed: Bool { phase == .on || phase == .done }

    var leaveAt: Date? {
        startsAt.map { $0.addingTimeInterval(-Double(SharedSession.walkMinutes ?? 8) * 60) }
    }

    func revealGated(at date: Date) -> LockScreenSnapshot {
        guard isRevealed, revealAt.map({ date < $0 }) ?? true else { return self }
        var hidden = self
        hidden.phase = tappedDown ? .waiting : .open
        hidden.going = []
        hidden.amGoing = false
        hidden.canHopIn = false
        hidden.revealAt = nil
        return hidden
    }

}

extension LockScreenSnapshot {
    init(today: TodayResponse, crew: CrewResponse?, myUserId: String?, fetchedAt: Date = .now) {
        let plan = today.frolic?.plan
        let members = crew?.members ?? []
        let meId = myUserId ?? members.first(where: \.isMe)?.userId
        func person(_ id: String, _ name: String, _ color: String, _ photo: String?) -> LockScreenPerson {
            LockScreenPerson(id: id, name: name, color: FlowerColor(rawValue: color) ?? .marigold, photoUrl: photo)
        }
        self.fetchedAt = fetchedAt
        phase = LockScreenPhase(rawValue: today.phase) ?? .none
        groupName = today.groupName
        frolicId = today.frolic?.frolicId
        day = today.frolic?.day
        planTitle = plan?.title ?? today.frolic?.notice
        placeName = plan?.place?.name
        placeLat = plan?.place?.lat
        placeLng = plan?.place?.lng
        heroKey = HeroKey.resolve(plan?.heroKey, title: plan?.title)
        startsAt = (today.reveal?.startsAt ?? plan?.startsAt).map(SharedSession.localDate(serverMs:))
        endsAt = today.reveal.map { SharedSession.localDate(serverMs: $0.endsAt) }
        sunsetAt = plan?.sunsetAt.map(SharedSession.localDate(serverMs:))
        deadline = today.frolic.map { SharedSession.localDate(serverMs: $0.deadline) }
        costLabel = plan?.costLabel
        me = members.first(where: { $0.userId == meId }).map { person($0.userId, $0.name, $0.color, $0.photoUrl) }
        free = members
            .filter { $0.userId != meId && ($0.free?.state == "now" || $0.free?.state == "window") }
            .map { person($0.userId, $0.name, $0.color, $0.photoUrl) }
        going = (today.reveal?.going ?? []).map { person($0.userId, $0.name, $0.color, $0.photoUrl) }
        onlyIf = today.myTap?.onlyIf.map(\.name) ?? []
        tookDayOff = today.myTap?.kind == "notToday"
        tappedDown = today.myTap?.kind == "down"
        revealAt = today.reveal.map { SharedSession.localDate(serverMs: max($0.revealAt, $0.me.bloomAt ?? $0.bloomAt)) }
        amGoing = today.reveal?.me.going ?? false
        canHopIn = today.reveal?.me.canHopIn ?? false
        hopInWaiting = today.reveal?.me.hopInWaiting ?? false
    }
}

enum HeroKey {
    static let all = ["plan-sunsets", "plan-outdoors", "plan-late-night-food", "plan-games", "plan-free-stuff"]

    static func resolve(_ key: String?, title: String?) -> String {
        if let key, all.contains(key) { return key }
        let text = (title ?? "").lowercased()
        let rules: [(String, [String])] = [
            ("plan-sunsets", ["sunset", "golden", "dusk", "sky"]),
            ("plan-late-night-food", ["noodle", "taco", "food", "late", "dumpling", "pizza", "boba", "ramen", "dinner", "snack"]),
            ("plan-games", ["game", "trivia", "bowling", "arcade", "board", "karaoke"]),
            ("plan-free-stuff", ["free", "museum", "market", "concert", "show"]),
            ("plan-outdoors", ["kayak", "hike", "park", "picnic", "beach", "trail", "marina", "glade"]),
        ]
        return rules.first { rule in rule.1.contains { text.contains($0) } }?.0 ?? "plan-outdoors"
    }
}
