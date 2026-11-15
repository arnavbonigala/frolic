import SwiftUI

struct YouScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var phase: ScreenPhase = .loading

    private var shown: ScreenPhase { router.resolve(phase, isOnline: connectivity.isOnline) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Loading your flower",
                        emptyTitle: "Make your flower",
                        emptyMessage: "Add your name and a photo. Your crew sees your name and photo, and nothing else.",
                        emptyAction: "Get started",
                        errorTitle: "Couldn't load your profile"
                    ),
                    color: .tomato,
                    onRetry: { phase = backend.initialPhase }
                ) {
                    YouReadyPreview()
                }
                #if DEBUG || E2E
                Button {
                    router.showsGallery = true
                } label: {
                    Label("Component gallery", systemImage: "square.grid.2x2")
                }
                .buttonStyle(.frolicText)
                .frame(maxWidth: .infinity)
                .padding(.top, 20)
                .accessibilityIdentifier("you.gallery")
                #endif
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("you.screen")
        .task { phase = backend.initialPhase }
    }
}

private struct YouReadyPreview: View {
    @State private var budget = 1
    @State private var energy = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                FlowerView(person: SampleData.you, radius: 36, stem: 0)
                VStack(alignment: .leading, spacing: 0) {
                    Text("You")
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundStyle(FrolicColor.ink)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("you.title")
                    Text("Sunset Crew")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
            }
            FrolicCard {
                HStack(spacing: 12) {
                    FlowerView(state: .bud, person: SampleData.you, radius: 16, stem: 0)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("No frolics yet")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                        Text("Your first flower grows the first time you go.")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                }
            }
            .padding(.top, 18)
            SectionHeader(title: "Only you see these", systemImage: "lock.fill")
                .accessibilityIdentifier("you.privateHeader")
            FrolicGroup {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Spend up to").frolicFont(.body).foregroundStyle(FrolicColor.ink)
                    FrolicSegmented(
                        label: "Spend up to",
                        options: [
                            (0, "Free", "you.budget.free"),
                            (1, "$10", "you.budget.ten"),
                            (2, "$25", "you.budget.twentyFive"),
                            (3, "Any", "you.budget.any"),
                        ],
                        selection: $budget
                    )
                    .accessibilityIdentifier("you.budget")
                }
                .padding(16)
                FrolicColor.line.frame(height: 0.5)
                VStack(alignment: .leading, spacing: 10) {
                    Text("Energy").frolicFont(.body).foregroundStyle(FrolicColor.ink)
                    FrolicSegmented(
                        label: "Energy",
                        options: [(0, "Chill", "you.energy.chill"), (1, "Down for anything", "you.energy.anything")],
                        selection: $energy
                    )
                    .accessibilityIdentifier("you.energy")
                }
                .padding(16)
            }
        }
    }
}
