import PhotosUI
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
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var uploading = false

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
        .onChange(of: pickedPhoto) { _, item in
            guard let item else { return }
            Task { await upload(item) }
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
                    emptyMessage: "This frolic has faded.",
                    errorTitle: "Couldn't load that night"
                ),
                color: row.going.first?.color ?? .marigold,
                onRetry: { store.loadMemory(row, backend: backend, route: router.e2eRoute) }
            )
            .padding(.top, 40)
        }
    }

    private func displayed(_ person: GardenPerson) -> GardenPerson {
        guard person.userId == store.myUserId else { return person }
        return GardenPerson(userId: person.userId, name: "You", color: person.color, photoUrl: person.photoUrl)
    }

    private func people(_ memory: GardenMemory) -> some View {
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(Array(memory.going.sorted { $0.userId == store.myUserId && $1.userId != store.myUserId }.enumerated()), id: \.element.id) { index, person in
                GardenFlower(
                    person: displayed(person),
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
                if canAddPhoto(memory) {
                    PhotosPicker(selection: $pickedPhoto, matching: .images) {
                        VStack(spacing: 8) {
                            if uploading {
                                ProgressView().tint(FrolicColor.ink)
                            } else {
                                Image(systemName: "plus")
                                    .font(.system(size: 22, weight: .bold))
                            }
                            Text("Add your photo")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(FrolicColor.ink)
                        .frame(width: 130, height: 160)
                        .background(FrolicColor.chip, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .disabled(uploading)
                    .accessibilityIdentifier("memory.addPhoto")
                    .accessibilityLabel("Add your photo")
                }
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

    private func canAddPhoto(_ memory: GardenMemory) -> Bool {
        guard let me = store.myUserId else { return false }
        return memory.going.contains { $0.userId == me }
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { pickedPhoto = nil }
        guard let identity = GardenIdentity.resolve(), let client = backend.client else {
            toast = "Couldn't add that photo. Try again."
            return
        }
        uploading = true
        defer { uploading = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let jpeg = image.jpegData(compressionQuality: 0.8)
            else { throw BackendError.notConfigured }
            let urlString: String = try await client.mutation("users:generateUploadUrl", with: ["deviceToken": identity.deviceToken])
            guard let url = URL(string: urlString) else { throw BackendError.notConfigured }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
            let (body, _) = try await URLSession.shared.upload(for: request, from: jpeg)
            struct Uploaded: Decodable { let storageId: String }
            let uploaded = try JSONDecoder().decode(Uploaded.self, from: body)
            try await client.mutation("garden:setMine", with: [
                "deviceToken": identity.deviceToken,
                "frolicId": row.frolicId,
                "storageId": uploaded.storageId,
            ])
            toast = "Your photo is in. Your crew sees it now."
        } catch {
            toast = "Couldn't add that photo. Try again."
        }
    }

    private func shareMemory() {
        let card = GardenStoryCard(
            groupName: row.dateLine,
            countLine: row.namesLine(me: store.myUserId),
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
