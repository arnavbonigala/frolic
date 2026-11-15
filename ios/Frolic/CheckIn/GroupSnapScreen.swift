import PhotosUI
import SwiftUI
import UIKit

struct GroupSnapScreen: View {
    @Bindable var store: CheckInStore
    @Bindable var model: GroupSnapModel
    var shown: ScreenPhase
    var autoSnap: Bool
    var onBack: () -> Void
    var onSkip: () -> Void
    @Environment(FrolicBackend.self) private var backend
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var picked: PhotosPickerItem?
    @State private var localShot: UIImage?
    @State private var started = false

    private var countdown: Bool {
        model.stage == .counting || model.stage == .capturing
    }

    var body: some View {
        ZStack {
            background
            if shown == .ready || shown == .offline {
                if model.stage == .done {
                    Color.black
                } else if countdown {
                    countdownLayer
                } else {
                    cameraLayer
                }
            } else {
                Color.black
                OnDarkPhase(phase: shown, copy: PlaceholderCopy(
                    loading: "Getting the snaps ready",
                    emptyTitle: "The snap window is closed",
                    emptyMessage: "The next frolic starts a new one.",
                    errorTitle: "Couldn't reach the group snap"
                ), onRetry: onBack)
            }
        }
        .ignoresSafeArea()
        .accessibilityIdentifier("checkin.screen")
        .task {
            await model.camera.prepare()
            model.camera.start()
            if autoSnap, !started { start() }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    localShot = image
                    model.photo = image
                }
            }
        }
        .onDisappear { model.cancel() }
    }

    private var background: some View {
        Group {
            if model.camera.mode == .ready, shown == .ready {
                CameraPreview(session: model.camera.session)
            } else {
                Color.black
            }
        }
        .ignoresSafeArea()
    }

    private var cameraLayer: some View {
        VStack(spacing: 0) {
            topBar
            Spacer(minLength: 0)
            if let photo = model.photo, model.stage == .uploading {
                Color.black.opacity(0.4)
                Text("Adding your shot")
                    .frolicFont(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.bottom, 8)
            }
            if let error = failureCopy {
                failureCard(error)
            } else if model.camera.mode == .denied || model.camera.mode == .unavailable {
                cameraOffCard
            } else {
                snapCard
                bottomBar
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.white.opacity(0.18)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back")
            .accessibilityIdentifier("checkin.back")
            Spacer()
            Button(action: onSkip) {
                Text("Skip photo")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(.black.opacity(0.6)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("checkin.skip")
        }
        .padding(.horizontal, 18)
        .padding(.top, 60)
    }

    private var snapCard: some View {
        VStack(spacing: 12) {
            if store.canShowArrival {
                WhopReturnCard(state: store.money.state, amount: store.money.dollars)
            }
            HStack(alignment: .center, spacing: 12) {
                HStack(spacing: 2) {
                    ForEach(Array(crew.prefix(3).enumerated()), id: \.element.id) { _, person in
                        SentShotAvatar(name: person.name, flower: person.flower, radius: 9)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("You're all here")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .accessibilityIdentifier("checkin.card")
                    Text("Group snap fires every phone at the same second. You'll see their shots once you add yours.")
                        .font(.system(size: 13))
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.72)))
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            Button(action: start) {
                Text("Group snap with \(store.otherNames)")
                    .frolicFont(.button)
                    .foregroundStyle(Color(hex: 0x1C1310))
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(Capsule().fill(.white))
            }
            .buttonStyle(.plain)
            .disabled(model.isBusy)
            .accessibilityIdentifier("checkin.snap")
            if model.camera.mode != .ready, localShot == nil {
                Text("Your phone can't reach the camera, so a photo from your library works just as well.")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 20)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.55))
    }

    private var cameraOffCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("The camera is off")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .accessibilityIdentifier("checkin.cameraOff")
            Text("Frolic uses the camera for the group snap with your crew. You can turn it on in Settings, or pick a photo you already have.")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    Link(destination: url) {
                        Text("Open Settings")
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .frame(minHeight: 44)
                            .padding(.horizontal, 16)
                            .background(Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1.5))
                    }
                    .accessibilityIdentifier("checkin.settings")
                }
                libraryPicker
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.8)))
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }

    private var libraryPicker: some View {
        PhotosPicker(selection: $picked, matching: .images) {
            Text("Use a photo instead")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: 0x1C1310))
                .frame(minHeight: 44)
                .padding(.horizontal, 16)
                .background(Capsule().fill(.white))
        }
        .accessibilityIdentifier("checkin.library")
    }

    private func failureCard(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("The snap didn't go through")
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button("Try again", action: start)
                    .buttonStyle(.frolicSecondary)
                    .accessibilityIdentifier("checkin.retry")
                libraryPicker
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.8)))
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("checkin.error")
    }

    private var failureCopy: String? {
        if case .failed(let message) = model.stage { return message }
        return nil
    }

    private var countdownLayer: some View {
        VStack(spacing: 14) {
            Spacer()
            Text(model.numeral > 0 ? "\(model.numeral)" : "1")
                .font(.system(size: 140, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.4), radius: 15, y: 6)
                .contentTransition(.identity)
                .accessibilityIdentifier("checkin.count")
                .accessibilityLabel("\(max(model.numeral, 1))")
            Text(countdownNote)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.25))
    }

    private var countdownNote: String {
        let names = store.others.map { "\($0.name)'s" }
        if names.count > 1 {
            return "\(FrolicNames.list(names)) phones are counting too"
        }
        if names.count == 1 {
            return "\(names[0]) phone is counting too"
        }
        return "Your phone is counting"
    }

    private var crew: [WirePerson] {
        ([store.myPerson].compactMap { $0 }) + store.others
    }

    private func start() {
        guard !model.isBusy, let frolicId = store.frolicId, let client = backend.client else { return }
        guard let token = try? CheckInSession.shared.requireToken() else { return }
        started = true
        let shot = localShot
        model.run(
            client: client,
            token: token,
            frolicId: frolicId,
            clockOffset: store.clockOffset,
            takenOverride: shot
        ) { image in
            store.noteSnapTaken(image, frolicId: frolicId)
        }
    }
}

struct OnDarkPhase: View {
    var phase: ScreenPhase
    var copy: PlaceholderCopy
    var onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            if phase == .loading {
                ProgressView().tint(.white)
                Text(copy.loading)
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.8))
            } else if phase == .offline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                Text("You're offline")
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                Text("The group snap needs a connection. It'll be back when you are.")
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                Button("Try again", action: onRetry)
                    .buttonStyle(.frolicSecondary)
            } else if case .error(let detail) = phase {
                Image(systemName: "camera.metering.unknown")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
                Text(copy.errorTitle)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                Button("Try again", action: onRetry)
                    .buttonStyle(.frolicSecondary)
            } else {
                Text(copy.emptyTitle)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                Text(copy.emptyMessage)
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.75))
                    .multilineTextAlignment(.center)
                Button("Back to today", action: onRetry)
                    .buttonStyle(.frolicSecondary)
            }
        }
        .padding(.horizontal, 30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.\(phase.name.lowercased())")
    }
}
