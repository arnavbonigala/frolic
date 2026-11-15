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
    var onSnapped: (UIImage) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var picked: PhotosPickerItem?
    @State private var autoStarted = false

    private var usesStill: Bool {
        #if DEBUG || E2E
        return model.camera.mode == .unavailable
        #else
        return false
        #endif
    }

    private var cameraOff: Bool {
        guard model.libraryShot == nil else { return false }
        return model.camera.mode == .denied || (model.camera.mode == .unavailable && !usesStill)
    }

    private var canSnap: Bool {
        model.camera.mode == .ready || model.libraryShot != nil || usesStill
    }

    var body: some View {
        ZStack {
            Color.clear
            switch shown {
            case .ready:
                content
            default:
                OnDarkPhase(phase: shown, onRetry: onBack)
            }
            Color.white
                .opacity(model.flash && !reduceMotion ? 0.85 : 0)
                .animation(.easeOut(duration: 0.35), value: model.flash)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .ignoresSafeArea()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(viewfinder)
        .accessibilityIdentifier("checkin.screen")
        .sensoryFeedback(.success, trigger: model.stage == .done)
        .task {
            await model.camera.prepare()
            armIfNeeded()
            if autoSnap, !autoStarted {
                autoStarted = true
                start()
            }
        }
        .onChange(of: store.snapAt) { _, _ in armIfNeeded() }
        .onChange(of: model.camera.mode) { _, _ in armIfNeeded() }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                    model.libraryShot = image
                }
            }
        }
    }

    private var viewfinder: some View {
        Color.black
            .overlay { viewfinderImage }
            .clipped()
            .ignoresSafeArea()
    }

    @ViewBuilder
    private var viewfinderImage: some View {
        if let photo = model.photo, model.stage == .uploading || model.stage == .done {
            Image(uiImage: photo).resizable().scaledToFill().accessibilityLabel("Your shot")
        } else if let shot = model.libraryShot {
            Image(uiImage: shot).resizable().scaledToFill().accessibilityLabel("Your shot")
        } else if model.camera.mode == .ready {
            CameraPreview(session: model.camera.session).accessibilityLabel("Camera view")
        } else if usesStill, let still = UIImage(named: "plan-sunsets") ?? UIImage(named: "hills_sunset") {
            Image(uiImage: still).resizable().scaledToFill().accessibilityLabel("Camera view")
        } else {
            Color(hex: 0x1C1310)
        }
    }

    private var content: some View {
        ZStack {
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                if model.stage == .counting {
                    Color.clear.frame(height: 160)
                } else if case .failed(let message) = model.stage {
                    failureCard(message)
                } else if model.stage == .uploading {
                    uploadingCard
                } else if cameraOff {
                    cameraOffCard
                } else {
                    if store.canShowArrival {
                        WhopReturnCard(state: store.money.state, amount: store.money.dollars)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 10)
                    }
                    snapCard
                    bottomBar
                }
            }
            if model.stage == .counting {
                countdownLayer
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Text("Back")
                    .frolicFont(.pill)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(Color(hex: 0x140E0A, opacity: 0.6)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("checkin.back")
            Spacer()
            Button(action: onSkip) {
                Text("Skip photo")
                    .frolicFont(.pill)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(Color(hex: 0x140E0A, opacity: 0.6)))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("checkin.skip")
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
    }

    private var snapCard: some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(spacing: -4) {
                ForEach(crew.prefix(3)) { person in
                    FlowerView(state: .bloom, color: person.flower, radius: 9, stem: 0)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(store.gatheredTitle)
                    .font(.system(.body, design: .rounded, weight: .bold))
                    .foregroundStyle(.white)
                Text("Everyone's shot unlocks when you add yours.")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.72)))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("checkin.card")
        .padding(.horizontal, 16)
        .padding(.bottom, 32)
    }

    private var bottomBar: some View {
        Button(action: start) {
            Text(store.others.isEmpty ? "Group snap" : "Group snap with \(store.otherNames)")
                .frolicFont(.button)
                .foregroundStyle(Color(hex: 0x1C1310))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(Capsule().fill(.white))
        }
        .buttonStyle(.plain)
        .disabled(model.isBusy || !canSnap)
        .opacity(canSnap ? 1 : 0.6)
        .accessibilityIdentifier("checkin.snap")
        .padding(.horizontal, 18)
        .padding(.top, 24)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.55).ignoresSafeArea(edges: .bottom))
    }

    private var uploadingCard: some View {
        HStack(spacing: 12) {
            ProgressView().tint(.white)
            Text("Adding your shot")
                .font(.system(.body, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.72)))
        .padding(.horizontal, 16)
        .padding(.bottom, 48)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("checkin.uploading")
    }

    private var cameraOffCard: some View {
        darkCard(
            title: "The camera is off",
            message: "Turn it on in Settings.",
            identifier: "checkin.cameraOff"
        ) {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                Link(destination: url) {
                    Text("Open Settings").modifier(DarkPill(filled: false))
                }
                .accessibilityIdentifier("checkin.settings")
            }
            libraryPicker
        }
    }

    private func failureCard(_ message: String) -> some View {
        darkCard(title: "The snap didn't go through", message: message, identifier: "checkin.error") {
            Button(action: retry) { Text("Try again").modifier(DarkPill(filled: true)) }
                .buttonStyle(.plain)
                .accessibilityIdentifier("checkin.retry")
            if model.photo == nil { libraryPicker }
        }
    }

    private func darkCard<Actions: View>(title: String, message: String, identifier: String, @ViewBuilder actions: () -> Actions) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(.body, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .accessibilityAddTraits(.isHeader)
            if !message.isEmpty {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            ViewThatFits {
                HStack(spacing: 10) { actions() }
                VStack(alignment: .leading, spacing: 10) { actions() }
            }
            .padding(.top, 4)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: 0x140E0A, opacity: 0.8)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
        .padding(.horizontal, 16)
        .padding(.bottom, 48)
    }

    private var libraryPicker: some View {
        PhotosPicker(selection: $picked, matching: .images) {
            Text("Use a photo instead").modifier(DarkPill(filled: true))
        }
        .accessibilityIdentifier("checkin.library")
    }

    private var countdownLayer: some View {
        VStack(spacing: 14) {
            Text("\(model.numeral)")
                .font(.system(size: 140, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.4), radius: 15, y: 6)
                .compositingGroup()
                .id(model.numeral)
                .transition(reduceMotion ? .opacity : .scale(scale: 1.4).combined(with: .opacity))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: model.numeral)
                .accessibilityIdentifier("checkin.count")
                .accessibilityLabel("\(model.numeral)")
            Text(countdownNote)
                .font(.system(.callout, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .shadow(color: .black.opacity(0.6), radius: 4, y: 1)
                .padding(.horizontal, 30)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.25))
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
    }

    private var countdownNote: String {
        let names = store.others.map(\.name)
        switch names.count {
        case 0: return "Hold still"
        case 1: return "\(names[0])'s phone is counting too"
        default: return "\(FrolicNames.list(names.map { "\($0)'s" })) phones are counting too"
        }
    }

    private var crew: [WirePerson] {
        [store.myPerson].compactMap { $0 } + store.others
    }

    private func start() {
        guard canSnap, let creds = store.credentials else { return }
        model.start(client: creds.0, token: creds.1, frolicId: creds.2, clockOffset: store.clockOffset, onDone: onSnapped)
    }

    private func retry() {
        guard let creds = store.credentials else { return }
        model.retryUpload(client: creds.0, token: creds.1, frolicId: creds.2, clockOffset: store.clockOffset, onDone: onSnapped)
    }

    private func armIfNeeded() {
        guard canSnap, let snapAt = store.snapAt, let creds = store.credentials else { return }
        model.arm(snapAt: snapAt, client: creds.0, token: creds.1, frolicId: creds.2, clockOffset: store.clockOffset, onDone: onSnapped)
    }
}

private struct DarkPill: ViewModifier {
    var filled: Bool

    func body(content: Content) -> some View {
        content
            .font(.system(.body, design: .rounded, weight: .bold))
            .foregroundStyle(filled ? Color(hex: 0x1C1310) : .white)
            .padding(.horizontal, 18)
            .frame(minHeight: 44)
            .background(Capsule().fill(filled ? Color.white : Color.clear))
            .overlay(Capsule().strokeBorder(.white.opacity(filled ? 0 : 0.5), lineWidth: 1.5))
    }
}

struct OnDarkPhase: View {
    var phase: ScreenPhase
    var onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            switch phase {
            case .loading:
                ProgressView().tint(.white)
                Text("Getting the group snap ready")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            case .offline:
                icon("wifi.slash")
                title("You're offline")
                retry("Try again")
            case .error(let detail):
                icon("exclamationmark.triangle")
                title("Couldn't reach the group snap")
                message(detail)
                retry("Try again")
            default:
                title("This one's over")
                retry("Back to today")
            }
        }
        .padding(.horizontal, 30)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: 0x1C1310).ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.\(phase.name.lowercased())")
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 26, weight: .bold))
            .foregroundStyle(.white.opacity(0.85))
            .accessibilityHidden(true)
    }

    private func title(_ text: String) -> some View {
        Text(text)
            .frolicFont(.sheetTitle)
            .foregroundStyle(.white)
            .accessibilityAddTraits(.isHeader)
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .frolicFont(.subheadline)
            .foregroundStyle(.white.opacity(0.75))
            .multilineTextAlignment(.center)
    }

    private func retry(_ label: String) -> some View {
        Button(label, action: onRetry).buttonStyle(.frolicSecondary)
    }
}
