import SwiftUI

struct YouPrivacyScreen: View {
    var model: YouModel

    @Environment(FrolicBackend.self) private var backend
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var permissions = YouPermissionModel()
    @State private var confirmingDelete = false

    var body: some View {
        VStack(spacing: 0) {
            SheetGrabber()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center) {
                        Text("Privacy")
                            .frolicFont(.sheetTitle)
                            .foregroundStyle(FrolicColor.ink)
                            .accessibilityAddTraits(.isHeader)
                            .accessibilityIdentifier("you.privacy.title")
                        Spacer(minLength: 12)
                        CircleIconButton(systemImage: "xmark", label: "Close") { dismiss() }
                    }
                    .padding(.top, 12)
                    Text("Nobody sees you're down unless they are too.")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                    SectionHeader(title: "Friends see")
                    FrolicGroup {
                        YouDetailRow(title: "Your name and photo")
                        YouDetailRow(title: "When you're free", showsDivider: true)
                        YouDetailRow(title: "How far away, roughly", showsDivider: true)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("you.privacy.friends")
                    SectionHeader(title: "Only you see", systemImage: "lock.fill")
                    FrolicGroup {
                        YouDetailRow(title: "If you said yes")
                        YouDetailRow(title: "Who you picked in Only with…", showsDivider: true)
                        YouDetailRow(title: "A pass", showsDivider: true)
                        YouDetailRow(title: "Your limits", showsDivider: true)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("you.privacy.private")
                    SectionHeader(title: "Permissions")
                    FrolicGroup {
                        YouPermissionRow(
                            title: "Notifications",
                            status: permissions.notifications,
                            identifier: "you.permissions.notifications",
                            action: permissions.openSettings
                        )
                        YouPermissionRow(
                            title: "Calendar",
                            status: permissions.calendar,
                            identifier: "you.permissions.calendar",
                            showsDivider: true,
                            action: permissions.openSettings
                        )
                        YouPermissionRow(
                            title: "Location",
                            status: permissions.location,
                            identifier: "you.permissions.location",
                            showsDivider: true,
                            action: permissions.openSettings
                        )
                    }
                    .padding(.bottom, 4)
                    Button("Open Settings", action: permissions.openSettings)
                        .buttonStyle(.frolicSecondaryWide)
                        .padding(.top, 12)
                        .accessibilityIdentifier("you.permissions.settings")
                    SectionHeader(title: "Your data")
                    FrolicGroup {
                        Button {
                            model.clearAccountError()
                            confirmingDelete = true
                        } label: {
                            HStack(spacing: 12) {
                                Text("Delete my account")
                                    .frolicFont(.bodyEmphasis)
                                    .foregroundStyle(FlowerColor.tomato.deep)
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(FrolicColor.ink.opacity(0.4))
                                    .accessibilityHidden(true)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .frame(minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("you.account.delete")
                    }
                    YouNote(text: "Also erases everything Frolic remembers about you.")
                        .padding(.bottom, 24)
                }
                .padding(.horizontal, 20)
            }
        }
        .background(FrolicColor.cream)
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(38)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("you.privacy.screen")
        .task { await permissions.refresh() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await permissions.refresh() }
        }
        .sheet(isPresented: $confirmingDelete) {
            YouDeleteSheet(model: model, onDeleted: { dismiss() })
        }
    }
}

private struct YouPermissionRow: View {
    var title: String
    var status: YouPermissionStatus
    var identifier: String
    var showsDivider = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(title)
                    .frolicFont(.body)
                    .foregroundStyle(FrolicColor.ink)
                Spacer(minLength: 8)
                Text(status.label)
                    .frolicFont(.body)
                    .foregroundStyle(FrolicColor.secondaryText)
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(FrolicColor.ink.opacity(0.4))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) {
            if showsDivider {
                FrolicColor.line.frame(height: 0.5).padding(.leading, 16)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

struct YouDetailRow: View {
    var title: String
    var showsDivider = false

    var body: some View {
        Text(title)
            .frolicFont(.body)
            .foregroundStyle(FrolicColor.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .overlay(alignment: .top) {
            if showsDivider {
                FrolicColor.line.frame(height: 0.5).padding(.leading, 16)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct SheetGrabber: View {
    var body: some View {
        Capsule()
            .fill(FrolicColor.ink.opacity(0.15))
            .frame(width: 36, height: 5)
            .padding(.top, 10)
            .accessibilityHidden(true)
    }
}
