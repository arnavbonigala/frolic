import Foundation

struct CrewRow: Identifiable {
    enum Status: Equatable {
        case free(String)
        case went
        case wentWithYou
        case busy
    }

    var id: String
    var name: String
    var color: FlowerColor
    var photoURL: String?
    var photoAsset: String?
    var isMe: Bool
    var status: Status
    var minutesAway: Int?
    var lookingNow: Bool = false

    var detail: String {
        switch status {
        case .free(let line):
            if let away = CrewCopy.distance(minutesAway) { return "\(line) · \(away)" }
            return line
        case .wentWithYou:
            return "Went with you today"
        case .went:
            return "Went today"
        case .busy:
            return "Busy now"
        }
    }

    var isFree: Bool {
        if case .free = status { return true }
        return false
    }

    var spokenStatus: String {
        switch status {
        case .free(let line):
            if let away = CrewCopy.distance(minutesAway) {
                return "\(line), \(away), roughly"
            }
            return line
        case .went, .wentWithYou:
            return ""
        case .busy:
            return "Busy now"
        }
    }

    var flowerState: FlowerState {
        isFree ? .bloom : .folded
    }
}

struct CrewComingUp: Equatable {
    var lead: String
    var body: String
    var heroAsset: String?
}

struct CrewLatelyRow: Identifiable, Equatable {
    var id: String
    var title: String
    var names: String
    var day: String
    var colors: [FlowerColor]
}

struct CrewFavoriteRow: Identifiable, Equatable {
    var id: String
    var title: String
    var count: String
}

struct CrewFundRow: Identifiable, Equatable {
    enum Kind: Equatable {
        case added
        case covered
        case returned
    }

    var id: String
    var text: String
    var day: String
    var kind: Kind
}

struct CrewFund: Equatable {
    var balanceCents: Int
    var rows: [CrewFundRow]

    var balanceLine: String { "Frolic Fund \(CrewCopy.money(balanceCents))" }
    var note: String { rows.isEmpty ? "A no-show tops it up." : "toward the next one" }
    var isEmpty: Bool { rows.isEmpty && balanceCents == 0 }
}

struct CrewView: Equatable {
    var groupName: String
    var subtitle: String
    var me: CrewRow
    var rows: [CrewRow]
    var nobodyFree: Bool
    var comingUp: CrewComingUp?
    var lately: [CrewLatelyRow]
    var favorites: [CrewFavoriteRow]
    var fund: CrewFund
    var wentToday: Bool
    var todayTitle: String?

    var friendRows: [CrewRow] { rows.filter { !$0.isMe } }
    var lookingNames: [String] { rows.filter(\.lookingNow).map(\.name) }
}
