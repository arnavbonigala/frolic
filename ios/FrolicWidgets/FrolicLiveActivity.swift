import ActivityKit
import SwiftUI
import WidgetKit

struct FrolicLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FrolicActivityAttributes.self) { context in
            LiveActivityLockScreenView(attributes: context.attributes, state: context.state, isStale: context.isStale)
                .activityBackgroundTint(FrolicColor.night)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FlowerView(color: context.attributes.color, radius: 18, stem: 0)
                        .accessibilityHidden(true)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ActivityCountdown(state: context.state, isStale: context.isStale)
                        .frame(maxWidth: 84, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Text(context.state.status)
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        GoingFaces(going: context.state.going, radius: 11)
                        Spacer(minLength: 8)
                        ActivityAction(stage: context.state.stage)
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                FlowerView(color: context.attributes.color, radius: 9, stem: 0)
                    .accessibilityLabel(context.attributes.title)
            } compactTrailing: {
                ActivityCountdown(state: context.state, isStale: context.isStale, numberSize: 14, showsUnit: false)
                    .frame(maxWidth: 46)
            } minimal: {
                ActivityCountdown(state: context.state, isStale: context.isStale, numberSize: 12, showsUnit: false)
                    .frame(maxWidth: 36)
            }
            .keylineTint(context.attributes.color.petal)
        }
    }
}
