import ActivityKit
import SwiftUI
import WidgetKit

struct FrolicLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FrolicActivityAttributes.self) { context in
            LiveActivityLockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(FrolicColor.night)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FlowerView(color: context.attributes.color, radius: 16, stem: 0)
                        .accessibilityHidden(true)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        LeaveCountdown(leaveAt: context.state.leaveAt)
                            .font(.system(size: 22, weight: .heavy, design: .rounded))
                            .foregroundStyle(FrolicColor.band)
                            .frame(maxWidth: 80, alignment: .trailing)
                        Text("leave in")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("\(context.attributes.place) at \(context.attributes.meetTime)")
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.status)
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
            } compactLeading: {
                FlowerView(color: context.attributes.color, radius: 9, stem: 0)
                    .accessibilityHidden(true)
            } compactTrailing: {
                LeaveCountdown(leaveAt: context.state.leaveAt)
                    .font(.system(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.band)
                    .frame(maxWidth: 44)
            } minimal: {
                FlowerView(color: context.attributes.color, radius: 9, stem: 0)
                    .accessibilityLabel("Leave soon")
            }
            .keylineTint(context.attributes.color.petal)
        }
    }
}
