import Foundation

struct DailyPickView: Codable, Equatable {
    var day: String
    var question: String
    var options: [String]
    var myAnswer: String?
    var results: DailyPickResults?
}

struct DailyPickResults: Codable, Equatable {
    var total: Double
    var byOption: [DailyPickTally]
}

struct DailyPickTally: Codable, Equatable, Identifiable {
    var option: String
    var count: Double
    var people: [TodayPerson]

    var id: String { option }
}

enum DailyPickPhase: Equatable {
    case loading
    case ready
    case error(String)
}

enum DailyPickCopy {
    static let label = "DAILY PICK"
    static let hidden = "See what your crew said"
    static let waters = "Picks water the garden."
    static let watered = "Your garden got watered."
    static let oneMore = "One more pick waters the garden."
    static let first = "You're first. Your crew's picks land here."
    static let errorTitle = "Couldn't load today's pick"
    static let retry = "Try again"
    static let failed = "That didn't go through. Try again."

    static func people(_ count: Int) -> String {
        count == 1 ? "1 pick" : "\(count) picks"
    }
}
