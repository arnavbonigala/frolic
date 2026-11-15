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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let stems: [CGFloat] = [30, 12, 38, 20, 26]
    private let heroHeight: CGFloat = 470

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            GeometryReader { proxy in
                let pull = reduceMotion ? 0 : max(0, proxy.frame(in: .scrollView).minY)
                TodayHeroImage(asset: hero, remote: heroURL, description: heroDescription)
                    .frame(width: proxy.size.width, height: heroHeight + pull)
                    .offset(y: -pull)
            }
            .frame(height: heroHeight)
            .overlay(alignment: .bottom) { meadow }
            .mask(alignment: .bottom) {
                DeckleEdge()
                    .frame(height: heroHeight + 600)
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Text(label)
                    if let number {
                        Text("·")
                        Text(number)
                    }
                }
                .todayFont(14, .bold, rounded: true, relativeTo: .subheadline)
                .foregroundStyle(FrolicColor.sun)
                .lineLimit(1)
                .accessibilityElement(children: .combine)
                content
                if showsWhy, let why {
                    WhyThis(text: why)
                        .padding(.top, 6)
                        .accessibilityIdentifier("today.plan.why")
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 10)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.plan.card")
    }

    @ViewBuilder
    private var meadow: some View {
        if !friends.isEmpty || friendsLine != nil {
            Button { onFriends?() } label: {
                VStack(spacing: 8) {
                    HStack(alignment: .bottom, spacing: 0) {
                        ForEach(Array(friends.prefix(5).enumerated()), id: \.element.id) { index, person in
                            TodayFlower(person: person, radius: 26, stem: stems[index % stems.count] + 10, swayDelay: Double(index) * 0.6)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, 28)
                    if let friendsLine {
                        Text(friendsLine)
                            .todayFont(15, .semibold, rounded: true, relativeTo: .footnote)
                            .foregroundStyle(FrolicColor.ink)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.85)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(FrolicColor.cream.opacity(0.95)))
                            .shadow(color: Color(hex: 0x78501E, opacity: 0.18), radius: 8, y: 3)
                            .padding(.horizontal, 20)
                            .accessibilityIdentifier("today.freeRow")
                    }
                }
                .padding(.bottom, 34)
            }
            .buttonStyle(.plain)
            .disabled(onFriends == nil)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(friendsLine ?? "")
            .accessibilityHint(onFriends == nil ? "" : "Opens your crew")
            .accessibilityIdentifier("today.meadow")
        }
    }
}

struct DeckleEdge: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let base = rect.maxY - 14
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: base))
        let steps = Int(rect.width / 9)
        for step in stride(from: steps, through: 0, by: -1) {
            let x = rect.minX + CGFloat(step) / CGFloat(max(steps, 1)) * rect.width
            let wave = sin(Double(step) * 0.55) * 3.2 + sin(Double(step) * 1.7 + 1.3) * 2.1
            let jitter = Double((step * 7919) % 11) / 11.0 * 4.0
            path.addLine(to: CGPoint(x: x, y: base + CGFloat(wave + jitter)))
        }
        path.closeSubpath()
        return path
    }
}

struct PaperGrain: View {
    var body: some View {
        Canvas { context, size in
            var seed: UInt64 = 0x9E3779B97F4A7C15
            func next() -> Double {
                seed = seed &* 6364136223846793005 &+ 1442695040888963407
                return Double(seed >> 33) / Double(1 << 31)
            }
            let count = Int(size.width * size.height / 90)
            for _ in 0..<count {
                let rect = CGRect(x: next() * size.width, y: next() * size.height, width: 1.2, height: 1.2)
                context.fill(Path(ellipseIn: rect), with: .color(FrolicColor.ink.opacity(0.05 + next() * 0.05)))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
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
