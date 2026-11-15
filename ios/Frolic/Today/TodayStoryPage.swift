import ConvexMobile
import SwiftUI

struct TodayStoryPage<Actions: View>: View {
    var hero: String
    var people: [TodayPerson] = []
    var ghosts = 0
    var caption: String?
    var kicker: String
    var title: String
    var line: String?
    @ViewBuilder var actions: Actions

    private let heroHeight: CGFloat = 380
    private let stems: [CGFloat] = [34, 50, 40, 56, 44]

    var body: some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: heroHeight)
                .overlay { TodayHeroImage(asset: hero, remote: nil, description: nil) }
                .clipped()
                .mask(alignment: .bottom) {
                    VStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .black.opacity(0)], startPoint: .top, endPoint: .bottom)
                            .frame(height: 120)
                    }
                    .frame(height: heroHeight)
                }
                .overlay(alignment: .bottom) { meadow }
                .accessibilityHidden(caption == nil)
            Spacer(minLength: 16)
            VStack(spacing: 10) {
                Text(kicker)
                    .todayFont(14, .bold, rounded: true, relativeTo: .subheadline)
                    .foregroundStyle(StoryColor.accent)
                Text(title)
                    .storyFont(31)
                    .foregroundStyle(StoryColor.ink)
                    .accessibilityAddTraits(.isHeader)
                if let line {
                    Text(line)
                        .todayFont(17, relativeTo: .body)
                        .foregroundStyle(StoryColor.muted)
                }
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 24)
            VStack(spacing: 12) {
                actions
            }
            .padding(.horizontal, 24)
            .padding(.top, 34)
            Spacer(minLength: 16)
        }
        .containerRelativeFrame(.vertical, alignment: .top)
    }

    @ViewBuilder
    private var meadow: some View {
        if !people.isEmpty || ghosts > 0 || caption != nil {
            VStack(spacing: 8) {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(Array(people.prefix(5).enumerated()), id: \.element.id) { index, person in
                        TodayFlower(person: person, radius: 26, stem: stems[index % stems.count] + 10, swayDelay: Double(index) * 0.6)
                            .frame(maxWidth: .infinity)
                    }
                    ForEach(0..<ghosts, id: \.self) { _ in
                        Circle()
                            .strokeBorder(Color(hex: 0xFFF8EC), style: StrokeStyle(lineWidth: 2.5, dash: [5, 4]))
                            .background(Circle().fill(Color(hex: 0xFFF8EC).opacity(0.22)))
                            .frame(width: 48, height: 48)
                            .padding(.bottom, 18)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 28)
                .accessibilityHidden(true)
                if let caption {
                    Text(caption)
                        .todayFont(15, .semibold, rounded: true, relativeTo: .footnote)
                        .foregroundStyle(FrolicColor.ink)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .glassEffect(.regular, in: .capsule)
                        .padding(.horizontal, 20)
                }
            }
            .padding(.bottom, 22)
        }
    }
}

struct StoryPrimaryButton: View {
    var title: String
    var systemImage: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .todayFont(18, .bold, rounded: true, relativeTo: .headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 58)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(StoryColor.lantern).interactive(), in: .capsule)
        .shadow(color: StoryColor.lantern.opacity(0.4), radius: 16, y: 6)
    }
}

@MainActor
@Observable
final class TodayInviteLink {
    var url: URL?

    func load(backend: FrolicBackend) async {
        guard let client = try? backend.requireClient(), let groupId = FrolicIdentity.shared.groupId else { return }
        let code: String? = try? await client.mutation(
            "users:createInvite",
            with: ["deviceToken": FrolicIdentity.shared.deviceToken, "groupId": groupId]
        )
        guard let code = code?.lowercased() else { return }
        let base = ConvexConfig.siteURL.map { $0 + "/p/" } ?? "frolic://join/"
        url = URL(string: base + code)
    }
}

struct TodayInviteButton: View {
    var crewName: String
    @Environment(FrolicBackend.self) private var backend
    @State private var link = TodayInviteLink()

    var body: some View {
        Group {
            if let url = link.url {
                ShareLink(item: url, message: Text("Join \(crewName) on Frolic")) {
                    Label("Invite your people", systemImage: "square.and.arrow.up")
                        .todayFont(18, .bold, rounded: true, relativeTo: .headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 58)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular.tint(StoryColor.lantern).interactive(), in: .capsule)
                .shadow(color: StoryColor.lantern.opacity(0.4), radius: 16, y: 6)
            } else {
                StoryPrimaryButton(title: "Invite your people", systemImage: "square.and.arrow.up") {}
                    .opacity(0.6)
                    .disabled(true)
            }
        }
        .accessibilityIdentifier("today.invite")
        .task(id: FrolicIdentity.shared.groupId) { await link.load(backend: backend) }
    }
}
