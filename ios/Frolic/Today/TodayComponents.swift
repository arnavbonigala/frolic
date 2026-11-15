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
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(label)
                    .todayFont(12, .bold, relativeTo: .caption)
                    .tracking(0.3)
                Spacer(minLength: 8)
                if let number {
                    Text(number)
                        .todayFont(12, .semibold, relativeTo: .caption)
                        .opacity(0.7)
                }
            }
            .foregroundStyle(bandText)
            .padding(.horizontal, 16)
            .frame(minHeight: 36)
            .background(bandColor)
            .accessibilityElement(children: .combine)
            TodayHeroImage(asset: hero, remote: heroURL, description: heroDescription)
                .frame(height: 118)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .padding(.horizontal, 10)
                .padding(.top, 10)
            VStack(alignment: .leading, spacing: 10) {
                content
                if showsWhy, let why {
                    WhyThis(text: why)
                        .accessibilityIdentifier("today.plan.why")
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .background(FrolicColor.paper)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.12), radius: 17, y: 14)
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
        return free + (waiting ? ". Your bud is planted. See your crew" : ". See your crew")
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
