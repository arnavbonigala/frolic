import AppIntents
import SwiftUI

struct LeaveCountdown: View {
    var leaveAt: Date

    var body: some View {
        Text(timerInterval: Date.now...max(Date.now, leaveAt), countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

struct ActivityCountdown: View {
    var state: FrolicActivityAttributes.ContentState
    var isStale = false
    var numberSize: CGFloat = 22
    var showsUnit = true

    private var target: Date? {
        switch state.stage {
        case .leave: state.leaveAt
        case .onTheWay: state.arriveAt
        case .arrived: nil
        }
    }

    private var unit: String {
        switch state.stage {
        case .leave: isStale || (target ?? .now) <= .now ? "time to go" : "leave in"
        case .onTheWay: "away"
        case .arrived: "you made it"
        }
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Group {
                if let target, target > .now, !isStale {
                    LeaveCountdown(leaveAt: target)
                } else {
                    Text(state.stage == .arrived ? "Here" : "Now")
                }
            }
            .font(.system(size: numberSize, weight: .heavy, design: .rounded))
            .foregroundStyle(FrolicColor.band)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            if showsUnit {
                Text(unit)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ActivityAction: View {
    var stage: FrolicActivityAttributes.ContentState.Stage

    var body: some View {
        switch stage {
        case .leave:
            button(LockScreenCopy.onMyWay, intent: OnMyWayIntent(), id: "liveActivity.onMyWay")
        case .onTheWay:
            button(LockScreenCopy.imHere, intent: ImHereIntent(), id: "liveActivity.here")
        case .arrived:
            EmptyView()
        }
    }

    private func button(_ title: String, intent: some AppIntent, id: String) -> some View {
        Button(intent: intent) {
            Text(title)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(FrolicColor.bandText)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(FrolicColor.band, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityIdentifier(id)
    }
}

struct GoingFaces: View {
    var going: [ActivityPerson]
    var radius: CGFloat = 12

    var body: some View {
        HStack(spacing: -radius * 0.4) {
            ForEach(going.prefix(5), id: \.self) { person in
                FlowerView(person: FlowerPerson(id: person.id, name: person.name, color: person.color), radius: radius, stem: 0)
                    .overlay {
                        if let image = LockScreenStore.portrait(LockScreenPerson(id: person.id, name: person.name, color: person.color)) {
                            Image(uiImage: image)
                                .resizable()
                                .scaledToFill()
                                .frame(width: radius, height: radius)
                                .clipShape(Circle())
                        }
                    }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Going: \(LockScreenCopy.list(going.map(\.name)))")
        .accessibilityHidden(going.isEmpty)
    }
}

struct LiveActivityLockScreenView: View {
    var attributes: FrolicActivityAttributes
    var state: FrolicActivityAttributes.ContentState
    var isStale = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                FlowerView(state: .bloom, color: attributes.color, radius: 16, stem: 0)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attributes.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(state.status)
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 8)
                ActivityCountdown(state: state, isStale: isStale)
                    .frame(maxWidth: 96, alignment: .trailing)
            }
            if state.stage != .arrived || !state.going.isEmpty {
                HStack(spacing: 10) {
                    GoingFaces(going: state.going)
                    Spacer(minLength: 8)
                    ActivityAction(stage: state.stage)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("liveActivity.root")
    }
}
