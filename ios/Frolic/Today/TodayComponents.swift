import SwiftUI

struct TodayPacket<Content: View>: View {
    var label: String
    var number: String?
    var hero: String?
    var heroURL: String?
    var heroDescription: String?
    var showsWhy = true
    var why: String?
    var bandColor: Color = FrolicColor.band
    var bandText: Color = FrolicColor.bandText
    var friends: [TodayPerson] = []
    var friendsLine: String?
    var onFriends: (() -> Void)?
    @ViewBuilder var content: Content

    private let stems: [CGFloat] = [30, 12, 38, 20, 26]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TodayHeroImage(asset: hero, remote: heroURL, description: heroDescription)
                .frame(height: friends.isEmpty ? 220 : 280)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .topLeading) {
                    HStack(spacing: 5) {
                        Text(label)
                            .todayFont(13, .bold, rounded: true, relativeTo: .caption)
                        if let number {
                            Text(number)
                                .todayFont(13, .medium, rounded: true, relativeTo: .caption)
                                .opacity(0.72)
                        }
                    }
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(1)
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(FrolicColor.cream.opacity(0.94)))
                    .padding(12)
                    .accessibilityElement(children: .combine)
                }
                .overlay(alignment: .bottom) {
                    if !friends.isEmpty || friendsLine != nil {
                        Button { onFriends?() } label: {
                            VStack(spacing: 6) {
                                HStack(alignment: .bottom, spacing: 0) {
                                    ForEach(Array(friends.prefix(5).enumerated()), id: \.element.id) { index, person in
                                        TodayFlower(person: person, radius: 22, stem: stems[index % stems.count], swayDelay: Double(index) * 0.6)
                                            .frame(maxWidth: .infinity)
                                    }
                                }
                                .padding(.horizontal, 24)
                                if let friendsLine {
                                    Text(friendsLine)
                                        .todayFont(14, .semibold, rounded: true, relativeTo: .footnote)
                                        .foregroundStyle(FrolicColor.ink)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.8)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Capsule().fill(FrolicColor.cream.opacity(0.94)))
                                        .accessibilityIdentifier("today.freeRow")
                                }
                            }
                            .padding(.bottom, 12)
                        }
                        .buttonStyle(.plain)
                        .disabled(onFriends == nil)
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(friendsLine ?? "")
                        .accessibilityHint(onFriends == nil ? "" : "Opens your crew")
                        .accessibilityIdentifier("today.meadow")
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .padding(8)
            VStack(alignment: .leading, spacing: 8) {
                content
                if showsWhy, let why {
                    WhyThis(text: why)
                        .padding(.top, 4)
                        .accessibilityIdentifier("today.plan.why")
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(FrolicColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.10), radius: 20, y: 12)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.plan.card")
    }
}

struct TodayHeroImage: View {
    var asset: String?
    var remote: String?
    var description: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [FrolicColor.skyTop, FrolicColor.meadow],
                startPoint: .top,
                endPoint: .bottom
            )
            if let asset, UIImage(named: asset) != nil {
                Image(asset)
                    .resizable()
                    .scaledToFill()
            } else if let url = TodayMedia.url(remote) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    }
                }
            }
        }
        .clipped()
        .accessibilityLabel(description ?? "")
        .accessibilityHidden(description == nil)
    }
}

struct TodayMeadow: View {
    var people: [TodayPerson]
    var waiting: Bool
    var folded = false
    var buds: [TodayPerson] = []
    var slots = 0
    var action: (() -> Void)?

    private let stems: [CGFloat] = [36, 14, 44, 24, 30]

    var body: some View {
        Group {
            if let action {
                Button(action: action) { content }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label)
            } else {
                content
                    .accessibilityElement(children: .contain)
            }
        }
    }

    private var content: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(Array(people.enumerated()), id: \.element.id) { index, person in
                TodayFlower(
                    person: person,
                    state: folded ? .folded : .bloom,
                    radius: 28,
                    stem: folded ? 46 : stems[index % stems.count],
                    name: person.name,
                    status: folded ? "not free" : "free",
                    swayDelay: Double(index) * 0.6
                )
                .frame(maxWidth: .infinity)
            }
            ForEach(Array(buds.enumerated()), id: \.element.id) { index, person in
                TodayFlower(
                    person: person,
                    state: .bud,
                    radius: 24,
                    stem: 22,
                    name: person.name,
                    status: "planted in secret",
                    swayDelay: Double(index) * 0.4
                )
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("today.bud")
            }
            ForEach(0..<slots, id: \.self) { _ in
                Circle()
                    .strokeBorder(FrolicColor.disabled, style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
                    .frame(width: 44, height: 44)
                    .padding(.bottom, 20)
                    .frame(maxWidth: .infinity)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 128, alignment: .bottom)
    }

    private var label: String {
        let free = people.isEmpty ? "Nobody's free yet" : TodayCopy.names(people.map(\.name)) + (people.count == 1 ? " is free" : " are free")
        return free + (waiting ? ". You're down. See your crew" : ". See your crew")
    }
}

struct TodayCaption: View {
    var text: String
    var identifier: String
    var showsDots = false

    var body: some View {
        HStack(spacing: 6) {
            Text(text)
                .frolicFont(.pill)
                .foregroundStyle(FrolicColor.ink)
                .multilineTextAlignment(.center)
            if showsDots { TodayWaitingDots() }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

struct TodayWaitingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(FrolicColor.secondaryText.opacity(0.5))
                    .frame(width: 3, height: 3)
                    .opacity(reduceMotion ? 0.6 : (pulse ? 1 : 0.25))
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever().delay(Double(index) * 0.18),
                        value: pulse
                    )
            }
        }
        .onAppear { pulse = true }
        .accessibilityHidden(true)
    }
}

struct TodayStatusCard: View {
    var title: String
    var message: String
    var identifier: String?
    var bodyIdentifier: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .todayFont(16, .semibold, relativeTo: .headline)
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier(identifier ?? "")
                Text(message)
                    .todayFont(14, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier(bodyIdentifier ?? "")
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.08), radius: 13, y: 10)
        .accessibilityElement(children: .contain)
    }
}

struct TodayRowLink: View {
    var thumb: String?
    var thumbRemote: String?
    var prefix: String
    var text: String
    var identifier: String?
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                TodayHeroImage(asset: thumb, remote: thumbRemote, description: nil)
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                buildText
                    .todayFont(15, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.tertiaryText)
                    .accessibilityHidden(true)
            }
            .padding(10)
            .frame(minHeight: 60)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(prefix + " " + text)
        .accessibilityIdentifier(identifier ?? "")
    }

    private var buildText: Text {
        Text(prefix + " ").fontWeight(.bold).foregroundColor(FrolicColor.ink) + Text(text)
    }
}

struct TodayNotice: View {
    var text: String

    var body: some View {
        Text(text)
            .frolicFont(.footnote)
            .foregroundStyle(FrolicColor.cream)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(FrolicColor.ink.opacity(0.92)))
            .padding(.horizontal, 24)
            .accessibilityAddTraits(.isStaticText)
    }
}
