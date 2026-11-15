import SwiftUI

struct GardenScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var store = GardenStore()
    @State private var path: [GardenMemoryRow] = []
    @State private var showsStory = false
    @State private var toast: String?

    private var shown: ScreenPhase { router.resolve(store.phase, isOnline: connectivity.isOnline) }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ScreenTitle(
                        title: "Garden",
                        subtitle: shown == .ready ? store.overview?.subtitle : nil,
                        identifier: "garden"
                    )
                    content
                }
                .padding(.horizontal, 18)
                .padding(.top, 40)
                .padding(.bottom, 120)
            }
            .scrollIndicators(.hidden)
            .background(SkyBackground())
            .navigationDestination(for: GardenMemoryRow.self) { row in
                MemoryDetailScreen(row: row, store: store, toast: $toast)
            }
        }
        .accessibilityIdentifier("garden.screen")
        .gardenToast($toast)
        .sheet(isPresented: $showsStory) {
            if let overview = store.overview {
                GardenStorySheet(overview: overview, toast: $toast)
            }
        }
        .task {
            store.start(backend: backend, route: router.e2eRoute)
            openRoutedMemory()
        }
        .onChange(of: router.e2eRoute) { _, _ in
            store.start(backend: backend, route: router.e2eRoute)
            openRoutedMemory()
        }
        .onChange(of: store.overview) { _, _ in
            openRoutedMemory()
        }
    }

    @ViewBuilder
    private var content: some View {
        if shown == .ready, let overview = store.overview {
            ready(overview)
        } else if shown == .empty {
            GardenEmptyState()
        } else if shown == .ready {
            PhasePlaceholder(phase: .loading, copy: placeholderCopy, color: .moss)
        } else {
            PhasePlaceholder(
                phase: shown,
                copy: placeholderCopy,
                color: .moss,
                onRetry: { store.retry(backend: backend, route: router.e2eRoute) }
            )
        }
    }

    private func ready(_ overview: GardenOverview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let card = store.onThisDay {
                GardenOnThisDayCard(card: card)
                    .padding(.top, 16)
            }
            GardenBed(countLine: overview.countLine, sinceLine: overview.sinceLine, yourFlower: overview.youWent, colors: overview.memories.prefix(14).reversed().map { $0.going.first?.color ?? .lilac }, health: overview.health?.state ?? .fine)
                .padding(.top, 16)
            if let health = overview.health {
                GardenHealthRow(health: health) {
                    NotificationCenter.default.post(name: .gardenImFree, object: nil)
                    toast = "Your crew will see you're free"
                }
            }
            if let milestone = overview.milestone {
                GardenMilestoneRow(milestone: milestone)
            }
            Button {
                showsStory = true
            } label: {
                GardenWeekRow(line: overview.weekLine)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("garden.week")
            .accessibilityLabel("Your crew this week: \(overview.weekLine)")
            .accessibilityHint("Share your crew")
            .padding(.top, 12)
            if let fund = overview.fund {
                GardenFundRow(title: fund.frolicTitle, line: fund.line)
                    .padding(.top, 12)
            }
            if let collection = overview.collection {
                GardenCollectionShelf(collection: collection)
            }
            SectionHeader(title: "Frolics")
            VStack(spacing: 10) {
                ForEach(Array(overview.memories.enumerated()), id: \.element.id) { index, row in
                    Button {
                        path.append(row)
                    } label: {
                        GardenMemoryRowView(row: row)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("garden.memory.\(index + 1)")
                    .accessibilityLabel("\(row.title), \(row.subtitle)")
                }
            }
        }
    }

    private var placeholderCopy: PlaceholderCopy {
        PlaceholderCopy(
            loading: "Watering the garden",
            emptyTitle: "Nothing planted yet",
            emptyMessage: "Your first flower grows the first time you go.",
            errorTitle: "Couldn't load the garden"
        )
    }

    private func openRoutedMemory() {
        #if DEBUG || E2E
        guard let route = router.e2eRoute, route.screen == "memory", let overview = store.overview else { return }
        let index = (Int(route.argument ?? "") ?? 1) - 1
        guard overview.memories.indices.contains(index) else { return }
        let row = overview.memories[index]
        guard path.last?.frolicId != row.frolicId else { return }
        path = [row]
        #endif
    }
}

private struct GardenWeekRow: View {
    var line: String

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(FrolicColor.band)
                GardenFlower(person: nil, color: .tomato, radius: 13)
            }
            .frame(width: 44, height: 44)
            .accessibilityHidden(true)
            weekLine
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FrolicColor.ink.opacity(0.4))
        }
        .padding(.vertical, 8)
        .padding(.leading, 10)
        .padding(.trailing, 14)
        .frame(minHeight: 60)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.07), radius: 9, y: 6)
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var weekLine: Text {
        (
            Text("Your crew this week: ")
                .fontWeight(.bold)
                .foregroundColor(FrolicColor.ink)
            + Text(line)
                .foregroundColor(FrolicColor.secondaryText)
        )
    }
}

private struct GardenFundRow: View {
    var title: String
    var line: String

    var body: some View {
        HStack(spacing: 10) {
            GardenArtwork(key: "whop-fund-jar", seed: title)
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(line)
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("From the crew's Frolic Fund")
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("garden.fund")
    }
}

private struct GardenMemoryRowView: View {
    var row: GardenMemoryRow

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(FrolicColor.chip)
                if let photoUrl = row.photoUrl, !photoUrl.isEmpty {
                    GardenRemoteImage(url: photoUrl, heroKey: row.heroKey)
                } else {
                    GardenArtwork(key: row.heroKey, seed: row.title)
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(2)
                Text(row.subtitle)
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FrolicColor.ink.opacity(0.4))
        }
        .padding(8)
        .frame(minHeight: 88)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct GardenEmptyState: View {
    var body: some View {
        VStack(spacing: 16) {
            GardenArtwork(key: "state-garden-empty", seed: "garden-empty")
                .frame(height: 208)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text("Nothing planted yet")
                    .frolicFont(.sheetTitle)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("Your first flower grows the first time you go.")
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.empty")
    }
}

private struct GardenStorySheet: View {
    var overview: GardenOverview
    @Binding var toast: String?
    @Environment(\.dismiss) private var dismiss
    @State private var share: GardenSharePayload?
    @State private var shownToast: String?

    private var line: String {
        if let taste = overview.taste { return taste.headline }
        return String(overview.weekLine.prefix(1)).uppercased() + String(overview.weekLine.dropFirst())
    }

    private var detail: String? {
        overview.taste?.why
    }

    private var card: GardenStoryCard {
        GardenStoryCard(
            groupName: overview.groupName,
            countLine: overview.countLine,
            line: line,
            detail: detail,
            people: people
        )
    }

    private var people: [GardenPerson] {
        let crew = overview.memories.first?.going ?? []
        return [GardenPerson(userId: "me", name: "You", color: .tomato, photoUrl: nil)] + crew.prefix(4)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("Share your crew")
                    .frolicFont(.sheetTitle)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("garden.story.sheet")
                    .padding(.top, 18)
                card
                    .padding(.top, 14)
                Button("Share to Stories") {
                    shareStory()
                }
                .buttonStyle(.frolicPrimary)
                .accessibilityIdentifier("garden.story.share")
                .padding(.top, 16)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Color(hex: 0xFFFCF7))
        .gardenToast($shownToast)
        .presentationDetents([.height(600), .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(38)
        .sheet(item: $share) { payload in
            GardenShareSheet(image: payload.image, title: payload.title)
        }
    }

    private func shareStory() {
        guard let image = GardenStoryRenderer.image(card: card) else {
            shownToast = "Couldn't save that card. Try again."
            return
        }
        shownToast = "Saved. Ready for Stories"
        Task {
            try? await Task.sleep(for: .seconds(1))
            share = GardenSharePayload(image: image, title: detail ?? overview.weekLine)
        }
    }
}
