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
                    SectionHeader(title: "What your crew sees")
                    FrolicGroup {
                        YouDetailRow(title: "Who's free", detail: "Your free window, like Free till 8.")
                        YouDetailRow(title: "Your flower", detail: "Your name and your photo.", showsDivider: true)
                        YouDetailRow(title: "Rough distance", detail: "Minutes away, never a place.", showsDivider: true)
                        YouDetailRow(title: "Frolics you went to", detail: "The flowers in the Garden.", showsDivider: true)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("you.privacy.friends")
                    SectionHeader(title: "What stays yours", systemImage: "lock.fill")
                    FrolicGroup {
                        YouDetailRow(title: "Whether you said yes", detail: "Not even after a plan fades.")
                        YouDetailRow(title: "Only if picks", detail: "Nobody finds out you picked them.", showsDivider: true)
                        YouDetailRow(title: "A pass", detail: "Not today is silent. Nobody gets told.", showsDivider: true)
                        YouDetailRow(title: "Your limits", detail: "Budget, energy, travel and home by.", showsDivider: true)
                        YouDetailRow(title: "Your calendar", detail: "Free or busy, never what's on it.", showsDivider: true)
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
                    YouNote(text: "Frolic asks for each one the first time it needs it.")
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
                    YouNote(text: "Removes your flower, your limits and everything Frolic remembers about you, including its notes on what you like.")
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
    var detail: String
    var showsDivider = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .frolicFont(.bodyEmphasis)
                .foregroundStyle(FrolicColor.ink)
            Text(detail)
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
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
