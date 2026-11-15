import SwiftUI

struct GardenScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var phase: ScreenPhase = .loading

    private var shown: ScreenPhase { router.resolve(phase, isOnline: connectivity.isOnline) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(title: "Garden", subtitle: "Every frolic grows a flower. It never wilts.", identifier: "garden")
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Watering the garden",
                        emptyTitle: "Nothing planted yet",
                        emptyMessage: "Your first flower grows the first time you go.",
                        errorTitle: "Couldn't load the garden"
                    ),
                    color: .moss,
                    onRetry: { phase = backend.initialPhase }
                ) {
                    GardenReadyPreview()
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .background(FrolicColor.cream.ignoresSafeArea())
        .accessibilityIdentifier("garden.screen")
        .task { phase = backend.initialPhase }
    }
}

struct GardenBed: View {
    var count: Int
    var caption: String
    private let colors: [FlowerColor] = [.pink, .marigold, .cobalt, .moss, .lilac, .tomato, .pink, .moss, .marigold, .cobalt, .lilac, .tomato]
    private let stems: [CGFloat] = [30, 52, 40, 64, 36, 58, 44, 70, 32, 50, 42, 60]

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(
                stops: [
                    .init(color: FrolicColor.skyTop, location: 0),
                    .init(color: FrolicColor.skyMid, location: 0.6),
                    .init(color: FrolicColor.meadow, location: 0.6),
                    .init(color: FrolicColor.meadowDeep, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            HStack(alignment: .bottom, spacing: -6) {
                ForEach(colors.indices, id: \.self) { index in
                    FlowerView(color: colors[index], radius: 13, stem: stems[index], swayDelay: Double(index) * 0.4)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, 14)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(count) frolics")
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityIdentifier("garden.count")
                Text(caption)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .padding(.leading, 16)
            .padding(.top, 14)
        }
        .frame(height: 200)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .contain)
    }
}

private struct GardenReadyPreview: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            GardenBed(count: 12, caption: "all before you joined")
                .padding(.top, 16)
            SectionHeader(title: "Frolics")
            FrolicGroup {
                FrolicCell(title: "Cheese Board pizza", subtitle: "Nov 8 · Maya, Dev and Jordan", showsChevron: true) {
                    FlowerView(color: .marigold, radius: 18, stem: 0)
                }
                .accessibilityIdentifier("garden.memory.1")
                FrolicCell(title: "Bowling", subtitle: "Nov 2 · Dev, Jordan, Priya and Maya", showsChevron: true, showsDivider: true) {
                    FlowerView(color: .cobalt, radius: 18, stem: 0)
                }
                .accessibilityIdentifier("garden.memory.2")
            }
        }
    }
}
