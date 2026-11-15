import ActivityKit
import Foundation

enum LiveActivityController {
    static var areActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    @discardableResult
    static func start(_ attributes: FrolicActivityAttributes, leaveAt: Date, status: String) throws -> Activity<FrolicActivityAttributes> {
        let state = FrolicActivityAttributes.ContentState(leaveAt: leaveAt, status: status)
        let content = ActivityContent(state: state, staleDate: leaveAt.addingTimeInterval(3600))
        return try Activity.request(attributes: attributes, content: content, pushType: nil)
    }

    static func endAll() async {
        for activity in Activity<FrolicActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
