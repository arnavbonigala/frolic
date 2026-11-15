import PhotosUI
import SwiftUI

struct NameScreen: View {
    @Bindable var model: OnboardingModel
    @FocusState private var focused: Bool

    var body: some View {
        OnboardingPage(onBack: { model.backFromName() }) {
            OnboardingTitle(
                title: "What do your friends call you?",
                identifier: "name.title"
            )
            photoButton
                .padding(.top, 24)
            nameField
                .padding(.top, 20)
            HStack(alignment: .firstTextBaseline) {
                Text("Your crew sees your name and photo.")
                    .accessibilityIdentifier("name.foot")
                Spacer(minLength: 8)
                if model.showsCounter {
                    Text("\(model.firstName.count)/\(OnboardingModel.nameLimit)")
                        .monospacedDigit()
                        .foregroundStyle(model.firstName.count >= OnboardingModel.nameLimit ? FrolicColor.ink : FrolicColor.secondaryText)
                        .accessibilityLabel("\(model.firstName.count) of \(OnboardingModel.nameLimit) characters")
                        .accessibilityIdentifier("name.counter")
                        .transition(.opacity)
                }
            }
            .frolicFont(.footnote)
            .foregroundStyle(FrolicColor.secondaryText)
            .padding(.top, 12)
            .padding(.horizontal, 4)
            .animation(.easeOut(duration: 0.2), value: model.showsCounter)
        } bar: {
            VStack(spacing: 4) {
                if let failure = model.failure {
                    OnboardingNotice(
                        title: failure.title,
                        detail: failure.detail,
                        actionTitle: failure.canRetry ? "Try again" : nil,
                        onAction: { Task { await model.submitName() } }
                    )
                    .accessibilityIdentifier("state.error")
                    .transition(.opacity)
                }
                Button("Continue") {
                    Task { await model.submitName() }
                }
                .buttonStyle(.frolicPrimary)
                .disabled(trimmed.isEmpty || model.isSubmitting)
                .accessibilityIdentifier("name.continue")
            }
            .animation(.easeOut(duration: 0.2), value: model.failure)
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
        TextField("First name", text: Binding(get: { model.firstName }, set: { model.editName($0) }))
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
    @State private var items: [TastePhoto] = []
    @State private var denied = false

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
            if denied {
                Button("Allow photos in Settings") { model.openSettings() }
                    .buttonStyle(.frolicSecondary)
            }
            if !denied {
                Text("Recents from your photo library")
                    .frolicFont(.footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.horizontal, 4)
                    .accessibilityIdentifier("photo.sheet.caption")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .presentationDetents([.height(240)])
        .presentationBackground(FrolicColor.cream)
        .task {
            if model.isSeeded { items = TasteLibrary.photoSheetDemo; return }
            if TasteLibrary.access == .undetermined { _ = await TasteLibrary.requestAccess() }
            guard TasteLibrary.access == .authorized || TasteLibrary.access == .limited else {
                denied = true
                return
            }
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
