import PhotosUI
import SwiftUI

struct NameScreen: View {
    @Bindable var model: OnboardingModel
    @FocusState private var focused: Bool

    var body: some View {
        OnboardingPage {
            OnboardingTitle(
                title: "What do your friends call you?",
                identifier: "name.title"
            )
            photoButton
                .padding(.top, 26)
            nameField
                .padding(.top, 22)
            Text("Your crew sees your name and photo.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 14)
                .padding(.horizontal, 4)
                .accessibilityIdentifier("name.foot")
            if let failure = model.failure {
                OnboardingStateCard(
                    title: failure.title,
                    detail: failure.detail,
                    actionTitle: failure.canRetry ? "Try again" : nil,
                    onAction: { Task { await model.submitName() } },
                    identifier: "state.error"
                )
                .padding(.top, 18)
            }
        } bar: {
            Button("Continue") {
                Task { await model.submitName() }
            }
            .buttonStyle(.frolicPrimary)
            .disabled(trimmed.isEmpty || model.isSubmitting)
            .accessibilityIdentifier("name.continue")
        }
        .sheet(isPresented: $model.showsPhotoSheet) {
            PhotoSheet(model: model)
        }
        .onAppear { focused = false }
    }

    private var trimmed: String {
        model.firstName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var photoButton: some View {
        Button {
            model.showsPhotoSheet = true
        } label: {
            VStack(spacing: 8) {
                ZStack {
                    Circle().fill(FrolicColor.paper)
                    Circle().stroke(FrolicColor.line, lineWidth: 1)
                    if let image = model.photoImage {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .clipShape(Circle())
                    } else {
                        FlowerView(state: .bloom, color: .tomato, radius: 40, stem: 0)
                    }
                }
                .frame(width: 116, height: 116)
                .clipShape(Circle())
                Text(model.photoImage == nil ? "Add a photo" : "Change photo")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.photoImage == nil ? "Add a photo" : "Change photo")
        .accessibilityIdentifier("name.photo")
    }

    private var nameField: some View {
        TextField("First name", text: $model.firstName)
            .textContentType(.givenName)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .submitLabel(.done)
            .focused($focused)
            .font(.system(size: 20))
            .foregroundStyle(FrolicColor.ink)
            .padding(.horizontal, 18)
            .frame(height: 56)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
            .accessibilityIdentifier("name.field")
            .accessibilityLabel("First name")
            .onSubmit { Task { await model.submitName() } }
    }
}

struct PhotoSheet: View {
    @Bindable var model: OnboardingModel
    @Environment(\.dismiss) private var dismiss
    @State private var items: [TastePhoto] = TasteLibrary.photoSheetDemo

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add a photo")
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("photo.sheet.title")
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    Button {
                        choose(item)
                        dismiss()
                    } label: {
                        ZStack {
                            FrolicColor.chip
                            if let image = item.image {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                            }
                        }
                        .frame(height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(item.label)
                    .accessibilityIdentifier("photo.sheet.item.\(index + 1)")
                }
            }
            Text("Recents from your photo library")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.horizontal, 4)
                .accessibilityIdentifier("photo.sheet.caption")
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .presentationDetents([.height(240)])
        .presentationBackground(FrolicColor.cream)
        .task {
            guard TasteLibrary.access == .authorized || TasteLibrary.access == .limited else { return }
            let recent = await TasteLibrary.recent()
            var loaded: [TastePhoto] = []
            for item in recent.prefix(4) {
                var photo = item
                photo.image = await TasteLibrary.image(for: item, size: 200)
                loaded.append(photo)
            }
            if !loaded.isEmpty { items = loaded }
        }
    }

    private func choose(_ item: TastePhoto) {
        model.photoImage = item.image
        model.photo = item.image?.jpegData(compressionQuality: 0.8)
    }
}
