import ActivityKit
import Foundation

struct ActivityPerson: Codable, Hashable {
    var id: String
    var name: String
    var color: FlowerColor
}

struct FrolicActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Stage: String, Codable, Hashable {
            case leave
            case onTheWay
            case arrived
        }

        var leaveAt: Date
        var status: String
        var stage: Stage = .leave
        var going: [ActivityPerson] = []
        var arriveAt: Date?
    }

    var planTitle: String
    var place: String
    var meetTime: String
    var color: FlowerColor
    var frolicId: String = ""

    var title: String { "\(place) at \(meetTime)" }
}
