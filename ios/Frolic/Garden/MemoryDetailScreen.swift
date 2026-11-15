import SwiftUI

struct MemoryDetailScreen: View {
    var row: GardenMemoryRow
    var store: GardenStore
    @Binding var toast: String?
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @Environment(\.dismiss) private var dismiss
    @State private var share: GardenSharePayload?

    private var shown: ScreenPhase { router.resolve(store.memoryPhase, isOnline: connectivity.isOnline) }

    private var memory: GardenMemory? { store.memory?.frolicId == row.frolicId ? store.memory : nil }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                hero
                detailBody
            }
        }
        .scrollIndicators(.hidden)
        .background(FrolicColor.cream)
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("memory.screen")
        .sheet(item: $share) { payload in
            GardenShareSheet(image: payload.image, title: payload.title)
        }
        .task {
            store.loadMemory(row, backend: backend, route: router.e2eRoute)
        }
    }

    private var hero: some View {
        ZStack(alignment: .top) {
            Group {
                if let url = memory?.photos.first?.url, !url.isEmpty {
                    GardenRemoteImage(url: url, heroKey: memory?.heroKey ?? row.heroKey)
                } else {
                    GardenArtwork(key: memory?.heroKey ?? row.heroKey, seed: row.title)
                }
            }
            .frame(height: 400)
            .frame(maxWidth: .infinity)
            .clipped()
            .accessibilityLabel(Text("Photo from \(row.title)"))
            .accessibilityHidden(shown != .ready)
            HStack {
                CircleIconButton(systemImage: "chevron.left", label: "Back to Garden") {
                    dismiss()
                }
                .accessibilityIdentifier("memory.back")
                Spacer()
                CircleIconButton(systemImage: "square.and.arrow.up", label: "Share") {
                    shareMemory()
                }
                .accessibilityIdentifier("memory.share")
            }
            .padding(.horizontal, 18)
            .padding(.top, 6)
        }
    }

    @ViewBuilder
    private var detailBody: some View {
        if shown == .ready, let memory {
            VStack(alignment: .leading, spacing: 0) {
                Text(memory.dateLine)
                    .frolicFont(.subheadline)
                    .fontWeight(.bold)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityIdentifier("memory.date")
                Text(memory.title)
                    .frolicFont(.largeTitle)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("memory.title")
                    .padding(.top, 2)
                people(memory)
                    .padding(.top, 12)
                placeCard(memory)
                    .padding(.top, 4)
                if let fundLine = memory.fundLine {
                    fundRow(fundLine)
                        .padding(.top, 12)
                }
                SectionHeader(title: "Photos")
                    .accessibilityIdentifier("memory.photos")
                if memory.photos.isEmpty {
                    Text("Nobody snapped this one.")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .padding(.bottom, 8)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            photoStrip(memory)
                .padding(.bottom, 40)
        } else {
            PhasePlaceholder(
                phase: shown == .ready ? .loading : shown,
                copy: PlaceholderCopy(
                    loading: "Fetching that night",
                    emptyTitle: "That night is gone",
                    emptyMessage: "This frolic is no longer in the garden.",
                    errorTitle: "Couldn't load that night"
                ),
                color: row.going.first?.color ?? .marigold,
                onRetry: { store.loadMemory(row, backend: backend, route: router.e2eRoute) }
            )
            .padding(.top, 40)
        }
    }

    private func people(_ memory: GardenMemory) -> some View {
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(Array(memory.going.enumerated()), id: \.element.id) { index, person in
                GardenFlower(
                    person: person,
                    color: person.color,
                    radius: 20,
                    stem: [24, 34, 20, 30, 26][index % 5],
                    showsName: true,
                    swayDelay: Double(index) * 0.5
                )
            }
            Spacer(minLength: 0)
        }
        .frame(height: 96)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Went: \(memory.namesLine)")
    }

    @ViewBuilder
    private func placeCard(_ memory: GardenMemory) -> some View {
        if memory.place != nil || memory.caption != nil {
            FrolicCard {
                VStack(alignment: .leading, spacing: 10) {
                    if let place = memory.place {
                        GardenArtwork(key: place.heroKey ?? memory.heroKey, seed: place.name)
                            .frame(height: 118)
                            .frame(maxWidth: .infinity)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .accessibilityHidden(true)
                        Text(place.name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                    }
                    if let caption = memory.caption, !caption.isEmpty {
                        Text(caption)
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .accessibilityElement(children: .contain)
        }
    }

    private func fundRow(_ line: String) -> some View {
        HStack(spacing: 10) {
            GardenArtwork(key: "whop-fund-jar", seed: line)
                .frame(width: 32, height: 32)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .accessibilityHidden(true)
            Text(line)
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("memory.fund")
    }

    private func photoStrip(_ memory: GardenMemory) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(memory.photos) { photo in
                    GardenRemoteImage(url: photo.url, heroKey: photo.heroKey ?? memory.heroKey)
                        .frame(width: 130, height: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityLabel(Text(photo.caption ?? "Photo from \(memory.title)"))
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func shareMemory() {
        let card = GardenStoryCard(
            groupName: row.dateLine,
            countLine: row.namesLine,
            line: memory?.title ?? row.title,
            detail: memory?.caption,
            people: memory?.going ?? row.going
        )
        guard let image = GardenStoryRenderer.image(card: card) else {
            toast = "Couldn't save that card. Try again."
            return
        }
        toast = "Saved. Ready for Stories"
        Task {
            try? await Task.sleep(for: .seconds(1))
            share = GardenSharePayload(image: image, title: memory?.title ?? row.title)
        }
    }
}
