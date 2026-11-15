import SwiftUI

struct YouDeleteSheet: View {
    var model: YouModel
    var onDeleted: () -> Void

    @Environment(FrolicBackend.self) private var backend
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            SheetGrabber()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Delete my account")
                        .frolicFont(.sheetTitle)
                        .foregroundStyle(FrolicColor.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("Your flower, your limits and everything Frolic remembers about you go with it. Your crew keeps the frolics they went to with you. This can't be undone.")
                        .frolicFont(.body)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    if model.accountPhase == .failed {
                        YouBanner(
                            systemImage: "exclamationmark.circle",
                            title: "That didn't go through",
                            message: "Check your connection and try again."
                        )
                        .padding(.top, 4)
                        .accessibilityIdentifier("you.delete.error")
                    }
                    Button(action: delete) {
                        if model.accountPhase == .working {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .tint(FrolicColor.cream)
                                Text("Deleting your account")
                            }
                        } else {
                            Text("Delete my account")
                        }
                    }
                    .buttonStyle(.frolicPrimary)
                    .disabled(model.accountPhase == .working)
                    .padding(.top, 10)
                    .accessibilityIdentifier("you.delete.confirm")
                    Button("Keep my account") { dismiss() }
                        .buttonStyle(.frolicSecondaryWide)
                        .disabled(model.accountPhase == .working)
                        .accessibilityIdentifier("you.delete.cancel")
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .background(FrolicColor.cream)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(38)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("you.delete.sheet")
    }

    private func delete() {
        Task {
            await model.deleteAccount(backend: backend)
            if model.loadPhase == .empty {
                dismiss()
                onDeleted()
            }
        }
    }
}

struct YouTasteSheet: View {
    var model: YouModel

    @Environment(\.dismiss) private var dismiss
    @State private var selected: Set<String> = []
    @State private var seeded = false

    private let options = ["Sunsets", "Outdoors", "Late-night food", "Games", "Free stuff"]

    var body: some View {
        VStack(spacing: 0) {
            SheetGrabber()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center) {
                        Text("What you're into")
                            .frolicFont(.sheetTitle)
                            .foregroundStyle(FrolicColor.ink)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: 12)
                        CircleIconButton(systemImage: "xmark", label: "Close") { dismiss() }
                    }
                    Text("Pick what your crew should plan around.")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    FlowLayout(spacing: 6) {
                        ForEach(options, id: \.self) { tag in
                            tagButton(tag)
                        }
                    }
                    .padding(.top, 6)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("you.taste.sheet")
                    Button("Done") { save() }
                        .buttonStyle(.frolicPrimary)
                        .padding(.top, 6)
                        .accessibilityIdentifier("you.taste.done")
                    Text("Your crew's plans blend everyone's picks.")
                        .frolicFont(.footnote)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .background(FrolicColor.cream)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(38)
        .accessibilityElement(children: .contain)
        .onAppear {
            guard !seeded else { return }
            seeded = true
            selected = Set(model.tasteTags)
        }
    }

    private func tagButton(_ tag: String) -> some View {
        let isOn = selected.contains(tag)
        return Button {
            if isOn {
                selected.remove(tag)
            } else {
                selected.insert(tag)
            }
        } label: {
            Text(tag)
                .frolicFont(.pill)
                .foregroundStyle(isOn ? FrolicColor.cream : FrolicColor.chipText)
                .padding(.horizontal, 15)
                .frame(minHeight: 44)
                .background(Capsule().fill(isOn ? FrolicColor.ink : FrolicColor.chip))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityIdentifier("you.taste.\(tag.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }

    private func save() {
        let tags = options.filter { selected.contains($0) }
        model.tasteTags = tags
        YouPreferences.tasteTags = tags
        dismiss()
    }
}
