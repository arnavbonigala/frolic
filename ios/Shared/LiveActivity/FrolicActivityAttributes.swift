import ActivityKit
import Foundation

struct FrolicActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var leaveAt: Date
        var status: String
    }

    var planTitle: String
    var place: String
    var meetTime: String
    var color: FlowerColor
}
