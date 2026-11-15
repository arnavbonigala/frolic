import SwiftUI

struct LeaveCountdown: View {
    var leaveAt: Date

    var body: some View {
        Text(timerInterval: Date.now...max(Date.now, leaveAt), countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

struct LiveActivityLockScreenView: View {
    var attributes: FrolicActivityAttributes
    var state: FrolicActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            FlowerView(state: .bloom, color: attributes.color, radius: 16, stem: 0)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(attributes.place) at \(attributes.meetTime)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text(state.status)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                LeaveCountdown(leaveAt: state.leaveAt)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.band)
                    .frame(maxWidth: 90, alignment: .trailing)
                Text("leave in")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("liveActivity.root")
    }
}
