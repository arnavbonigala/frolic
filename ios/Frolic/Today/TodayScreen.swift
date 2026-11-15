import SwiftUI

struct TodayScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var phase: ScreenPhase = .loading

    private var shown: ScreenPhase { router.resolve(phase, isOnline: connectivity.isOnline) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack {
                    Wordmark()
                    Spacer()
                    if shown == .ready {
                        StatusPill(text: "Free till 8")
                            .accessibilityIdentifier("today.freePill")
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 8)
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Checking who's free",
                        emptyTitle: "No plan yet",
                        emptyMessage: "Today's plan arrives at 3. Your crew's flowers bloom here when they're free.",
                        errorTitle: "Couldn't load today's plan"
                    ),
                    color: .marigold,
                    onRetry: { phase = backend.initialPhase }
                ) {
                    TodayReadyPreview()
                }
            }
            .padding(.bottom, 24)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("today.screen")
        .task { phase = backend.initialPhase }
    }
}

private struct TodayReadyPreview: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom) {
                ForEach(Array(SampleData.friends.enumerated()), id: \.element.id) { index, person in
                    FlowerView(
                        state: .bloom,
                        person: person,
                        radius: 28,
                        stem: [36, 14, 44, 24][index],
                        showsName: true,
                        status: "free",
                        swayDelay: Double(index) * 0.6
                    )
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 128, alignment: .bottom)
            Text("Maya, Dev, Jordan and Priya are free")
                .frolicFont(.pill)
                .foregroundStyle(FrolicColor.ink)
                .multilineTextAlignment(.center)
                .padding(.top, 8)
                .accessibilityIdentifier("today.freeRow")
            SeedPacket(label: "TODAY · SATURDAY", number: "Crew frolic No. 13", image: "hills_sunset", imageDescription: "Sunset at Indian Rock") {
                Text("Sunset at Indian Rock")
                    .frolicFont(.title)
                    .foregroundStyle(FrolicColor.ink)
                ChipRow(chips: ["Free", "12 min walk", "Golden hour 4:28"])
                WhyThis(text: "you're into sunsets, it's free, and the sky's clear until dark.")
                    .accessibilityIdentifier("today.plan.why")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("today.plan.card")
            .padding(.horizontal, 16)
            .padding(.top, 14)
            HStack(spacing: 10) {
                Button("I'm down") {}
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("today.down")
                Button("Only with…") {}
                    .buttonStyle(.frolicSecondary)
                    .accessibilityIdentifier("today.onlyIf")
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            HushNote(text: "Nobody sees you're down unless they are too")
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .accessibilityIdentifier("today.hush")
        }
    }
}
