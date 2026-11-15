import Foundation

enum LockScreenCopy {
    static let dropTitle = "Today's frolic"
    static let down = "I'm down"
    static let onlyIf = "Only if"
    static let notToday = "Not today"
    static let hopIn = "Hop in"
    static let onMyWay = "I'm on my way"
    static let imHere = "I'm here"
    static let planted = "You're down"
    static let waitingLine = "Waiting for a friend"
    static let hush = "Nobody sees you're down unless they are too"
    static let itsOn = "It's on."
    static let drifted = "This one drifted off"
    static let nextDrop = "Tomorrow's plan arrives at 3."
    static let noPlanYet = "No plan yet"
    static let todayArrives = "Today's plan arrives at 3."
    static let dayOff = "Taking the day off"
    static let dayOffLine = "If your crew's plan happens, you can still hop in."
    static let signedOut = "Open Frolic to join your crew."
    static let errorTitle = "Couldn't reach Frolic"
    static let offlineTitle = "You're offline"
    static let tryAgain = "Try again"
    static let tapFailed = "Couldn't send that. Open Frolic to try again."
    static let notYet = "Today's plan isn't out yet. Try again in a minute."

    static func list(_ names: [String]) -> String {
        switch names.count {
        case 0: ""
        case 1: names[0]
        case 2: "\(names[0]) and \(names[1])"
        default: names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]
        }
    }

    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "h:mm"
        return formatter.string(from: date)
    }

    static func dropBody(free: [String], sunset: Date?) -> String {
        let who = list(free)
        let verb = free.count == 1 ? "is" : "are"
        switch (free.isEmpty, sunset) {
        case (false, let sunset?): return "\(who) \(verb) free and the sun sets at \(time(sunset)). Just saying."
        case (false, nil): return "\(who) \(verb) free today. Just saying."
        case (true, let sunset?): return "Today's plan is in, and the sun sets at \(time(sunset)). Just saying."
        case (true, nil): return "Today's plan is in. Just saying."
        }
    }

    static func freeLine(_ free: [String]) -> String {
        free.isEmpty ? "Be the first to say yes" : "\(list(free)) \(free.count == 1 ? "is" : "are") free"
    }

    static func goingLine(_ going: [String], meName: String?, amGoing: Bool) -> String {
        let others = going.filter { $0 != meName }
        return list(amGoing ? ["You"] + others : others)
    }

    static func onlyIfLine(_ names: [String]) -> String {
        names.isEmpty ? "You're down" : "You're down, if \(list(names)) \(names.count == 1 ? "is" : "are") in"
    }

    static func hopInLine(going: [String], place: String?) -> String {
        guard !going.isEmpty else { return "Room for one more?" }
        let verb = going.count == 1 ? "is" : "are"
        return place.map { "\(list(going)) \(verb) at \($0). Room for one more?" } ?? "\(list(going)) \(verb) going. Room for one more?"
    }

    static func placeAt(_ place: String?, _ startsAt: Date?) -> String {
        let name = (place ?? "The spot").replacingOccurrences(of: "^the ", with: "The ", options: .regularExpression)
        return startsAt.map { "\(name) at \(time($0))" } ?? name
    }

    static func bloomedLine(going: [String], meName: String?, place: String?) -> String {
        "\(goingLine(going, meName: meName, amGoing: true)) went to \(place ?? "the spot") today."
    }
}
