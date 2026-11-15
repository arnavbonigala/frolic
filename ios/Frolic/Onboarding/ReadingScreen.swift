import SwiftUI

struct ReadingScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        OnboardingPage {
            OnboardingTitle(title: "You're into", identifier: "reading.title")
            statusLine
                .padding(.top, 22)
            OnboardingChipFlow(tags: model.tags, identifierPrefix: "reading")
                .padding(.top, 16)
                .animation(.spring(response: 0.4, dampingFraction: 0.6), value: model.tags)
            FrolicGroup {
                ForEach(Array(model.pickedPhotos.enumerated()), id: \.element.id) { index, photo in
                    row(photo, divider: index > 0)
                }
            }
            .padding(.top, 20)
            Text("Your crew's plans blend everyone's picks. It keeps learning from what you say yes to.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 18)
                .padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        } bar: {
            Button("Sounds like me") {
                Task { await model.confirmTaste() }
            }
            .buttonStyle(.frolicPrimary)
            .disabled(model.readingPhase == .reading || model.isSubmitting)
            .accessibilityIdentifier("reading.confirm")
            Button("Pick different photos") { model.repick() }
                .buttonStyle(.frolicText)
                .accessibilityIdentifier("reading.repick")
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        switch model.readingPhase {
        case .reading:
            HStack(spacing: 10) {
                OnboardingSpinner()
                Text("Looking at your photos on your phone")
            }
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(FrolicColor.secondaryText)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("reading.status")
        case .done:
            Text("That's what Frolic will plan around.")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(FrolicColor.secondaryText)
                .accessibilityIdentifier("reading.status")
        case .quiet:
            VStack(alignment: .leading, spacing: 4) {
                Text("Nothing stood out in those photos.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink)
                Text("Pick different ones, or continue and Frolic will learn from what you say yes to.")
                    .font(.system(size: 15))
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("reading.status")
        }
    }

    private func row(_ photo: TastePhoto, divider: Bool) -> some View {
        HStack(spacing: 12) {
            Group {
                if let image = photo.image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    FrolicColor.chip
                }
            }
            .frame(width: 44, height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityHidden(true)
            Text(photo.label)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(FrolicColor.ink)
            Spacer(minLength: 8)
            if let tag = photo.tags.first {
                Text(tag.label)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.secondaryText)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 64)
        .overlay(alignment: .top) {
            if divider { FrolicColor.line.frame(height: 0.5).padding(.leading, 16) }
        }
        .accessibilityElement(children: .combine)
    }
}
