import SwiftUI

struct TasteScreen: View {
    @Bindable var model: OnboardingModel
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 3)

    var body: some View {
        OnboardingPage {
            OnboardingTitle(
                title: "Pick a few nights you loved",
                subcopy: "From your camera roll. Frolic learns what you're into so plans fit you. Pick at least 3.",
                identifier: "taste.title"
            )
            switch model.photoPhase {
            case .loading:
                loading
            case .ready:
                picker
            case .denied:
                denied
            case .empty:
                empty
            }
            HushNote(text: "Looked at on your phone. Photos are never uploaded.")
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 12)
                .padding(.horizontal, 4)
                .accessibilityIdentifier("taste.notice")
        } bar: {
            Button(model.canContinueTaste ? "Continue" : "Pick \(3 - model.pickedIds.count) more") {
                model.startReading()
            }
            .buttonStyle(.frolicPrimary)
            .disabled(!model.canContinueTaste)
            .accessibilityIdentifier("taste.continue")
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Recents")
                .frolicFont(.bodyEmphasis)
                .fontWeight(.bold)
                .foregroundStyle(FrolicColor.ink)
            Spacer()
            Text("\(model.pickedIds.count) selected")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .accessibilityIdentifier("taste.count")
        }
        .padding(.top, 20)
        .padding(.bottom, 8)
    }

    private var picker: some View {
        VStack(spacing: 0) {
            header
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(model.photos) { photo in
                    tile(photo)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func tile(_ photo: TastePhoto) -> some View {
        let index = model.pickIndex(photo.id)
        return Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            model.togglePick(photo.id)
        } label: {
            Color.black
                .aspectRatio(1, contentMode: .fit)
                .overlay {
                    if let image = photo.image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .opacity(index == nil ? 1 : 0.6)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    ZStack {
                        Circle().fill(index == nil ? Color.black.opacity(0.15) : Color(hex: 0x2C6BF0))
                        Circle().stroke(.white, lineWidth: 2)
                        if let index {
                            Text("\(index)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 24, height: 24)
                    .padding(6)
                }
                .clipped()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(photo.label)
        .accessibilityAddTraits(index == nil ? [] : .isSelected)
        .accessibilityIdentifier("taste.photo.\(photo.label)")
    }

    private var loading: some View {
        VStack(spacing: 4) {
            header
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(0..<9, id: \.self) { _ in
                    FrolicColor.chip.aspectRatio(1, contentMode: .fit)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your photos")
        .accessibilityIdentifier("state.loading")
    }

    private var denied: some View {
        VStack(spacing: 12) {
            OnboardingStateCard(
                title: "Frolic can't see your photos",
                body: "You can still pick from a few sample nights, or allow photos in Settings and come back.",
                actionTitle: "Pick from samples",
                secondaryTitle: "Open Settings",
                onAction: { Task { await model.useDemoPhotos() } },
                onSecondary: { model.openSettings() },
                identifier: "state.error"
            )
        }
        .padding(.top, 20)
    }

    private var empty: some View {
        OnboardingStateCard(
            title: "No photos yet",
            body: "Your camera roll is empty, so pick from a few sample nights instead.",
            actionTitle: "Pick from samples",
            onAction: { Task { await model.useDemoPhotos() } },
            identifier: "state.empty"
        )
        .padding(.top, 20)
    }
}
