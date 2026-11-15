import PhotosUI
import SwiftUI
import UIKit

extension YouModel {
    func rename(to name: String, backend: FrolicBackend) async -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let client = try? backend.requireClient() else { return false }
        do {
            try await client.mutation("users:updateProfile", with: [
                "deviceToken": FrolicIdentity.shared.deviceToken,
                "firstName": trimmed,
            ])
            return true
        } catch {
            return false
        }
    }

    func setPhoto(_ jpeg: Data, backend: FrolicBackend) async -> Bool {
        guard let client = try? backend.requireClient() else { return false }
        let token = FrolicIdentity.shared.deviceToken
        do {
            let uploadUrl: String = try await client.mutation("users:generateUploadUrl", with: ["deviceToken": token])
            guard let url = URL(string: uploadUrl) else { return false }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
            let (body, response) = try await URLSession.shared.upload(for: request, from: jpeg)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let storageId = payload["storageId"] as? String
            else { return false }
            try await client.mutation("users:updateProfile", with: ["deviceToken": token, "photoId": storageId])
            return true
        } catch {
            return false
        }
    }
}

struct YouAccountGroup: View {
    @Bindable var model: YouModel
    @Environment(FrolicBackend.self) private var backend
    @Environment(\.scenePhase) private var scenePhase
    @State private var permissions = YouPermissionModel()
    @State private var editingName = false
    @State private var draftName = ""
    @State private var picked: PhotosPickerItem?
    @State private var confirmingDelete = false
    @State private var failed = false
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FrolicGroup {
                Button {
                    draftName = model.profile?.name ?? ""
                    editingName = true
                } label: {
                    YouSetupRow(label: "Your name", value: model.profile?.name ?? "", identifier: "you.account.name")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                PhotosPicker(selection: $picked, matching: .images) {
                    YouSetupRow(label: "Change photo", value: busy ? "Saving" : "", identifier: "you.account.photo")
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                Button {
                    Task {
                        if permissions.notifications == .notAsked {
                            _ = await DropNotifications.requestAuthorization()
                            await permissions.refresh()
                        } else {
                            permissions.openSettings()
                        }
                    }
                } label: {
                    YouSetupRow(
                        label: "Notifications",
                        value: permissions.notifications == .notAsked ? "Turn on" : permissions.notifications.label,
                        identifier: "you.account.notifications"
                    )
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                Button {
                    model.clearAccountError()
                    confirmingDelete = true
                } label: {
                    HStack {
                        Text("Delete my account")
                            .frolicFont(.bodyEmphasis)
                            .foregroundStyle(FlowerColor.tomato.deep)
                        Spacer(minLength: 8)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 60)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("you.account.deleteRow")
            }
            if failed {
                YouNote(text: "Couldn't save that. Try again.", identifier: "you.account.error")
            }
        }
        .task { await permissions.refresh() }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await permissions.refresh() }
        }
        .alert("Your name", isPresented: $editingName) {
            TextField("Name", text: $draftName)
            Button("Save") {
                Task { failed = !(await model.rename(to: draftName, backend: backend)) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task { await upload(item) }
        }
        .sheet(isPresented: $confirmingDelete) {
            YouDeleteSheet(model: model, onDeleted: {})
        }
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { picked = nil }
        busy = true
        defer { busy = false }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.8)
        else {
            failed = true
            return
        }
        failed = !(await model.setPhoto(jpeg, backend: backend))
    }
}
