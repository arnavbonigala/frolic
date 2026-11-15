import SwiftUI

struct CrewScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var phase: ScreenPhase = .loading

    private var shown: ScreenPhase { router.resolve(phase, isOnline: connectivity.isOnline) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if shown == .ready {
                    ScreenTitle(title: "Sunset Crew", subtitle: "5 of you · the crew started in September", identifier: "crew")
                } else {
                    ScreenTitle(title: "Crew", identifier: "crew")
                }
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Finding your crew",
                        emptyTitle: "Your crew starts with one friend",
                        emptyMessage: "Send a link to the group chat. Anyone who taps I'm down joins your crew.",
                        emptyAction: "Invite a friend",
                        errorTitle: "Couldn't load your crew"
                    ),
                    color: .cobalt,
                    onRetry: { phase = backend.initialPhase }
                ) {
                    CrewReadyPreview()
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 24)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("crew.screen")
        .task { phase = backend.initialPhase }
    }
}

private struct CrewReadyPreview: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader(title: "Today")
            FrolicGroup {
                FrolicCell(title: "You", subtitle: "Free till 8", isFree: true) {
                    FlowerView(person: SampleData.you, radius: 22, stem: 0)
                }
                .accessibilityIdentifier("crew.row.you")
                ForEach(SampleData.friends) { person in
                    FrolicCell(title: person.name, subtitle: SampleData.freeLines[person.name], isFree: true, showsChevron: true, showsDivider: true) {
                        FlowerView(person: person, radius: 22, stem: 0)
                    }
                    .accessibilityIdentifier("crew.row.\(person.name.lowercased())")
                }
            }
            Text("Distances are rough on purpose. Nobody sees exactly where you are.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .accessibilityIdentifier("crew.distance.note")
            Button {
            } label: {
                Label("Invite a friend", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.frolicSecondaryWide)
            .padding(.top, 14)
            .accessibilityIdentifier("crew.invite")
        }
    }
}
