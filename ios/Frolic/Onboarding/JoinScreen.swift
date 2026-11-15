import SwiftUI

struct JoinScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                content
                    .frame(minHeight: geo.size.height - 120, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(backdrop.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingBottomBar { bar }
        }
        .sheet(isPresented: $model.showsInviteEntry) {
            InviteEntrySheet(model: model)
                .presentationDetents([.height(260)])
        }
    }

    private var backdrop: some View {
        ZStack(alignment: .bottom) {
            SkyBackground()
            if let painting = UIImage(named: "launch-meadow") {
                Image(uiImage: painting)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .clipped()
            }
        }
        .accessibilityHidden(true)
    }

    private var content: some View {
        VStack(spacing: 0) {
            header
            switch model.invitePhase {
            case .ready:
                welcomeCopy
                OnboardingBeat()
                    .padding(.horizontal, 18)
                    .padding(.top, 22)
            case .loading:
                HStack(spacing: 10) {
                    OnboardingSpinner()
                    Text("Looking for your crew")
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
                .padding(.top, 120)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Looking for your crew")
                .accessibilityIdentifier("state.loading")
            case .offline:
                OnboardingStateCard(
                    title: OnboardingFailure.offline.title,
                    detail: OnboardingFailure.offline.detail,
                    actionTitle: "Try again",
                    onAction: { model.retryInvite() },
                    identifier: "state.offline"
                )
                .padding(.horizontal, 18)
                .padding(.top, 120)
            case .expired:
                OnboardingStateCard(title: OnboardingFailure.inviteExpired.title, detail: OnboardingFailure.inviteExpired.detail, identifier: "state.error")
                    .padding(.horizontal, 18)
                    .padding(.top, 120)
            case .invalid:
                OnboardingStateCard(title: OnboardingFailure.inviteUnknown.title, detail: OnboardingFailure.inviteUnknown.detail, identifier: "state.error")
                    .padding(.horizontal, 18)
                    .padding(.top, 120)
            case .failed(let message):
                OnboardingStateCard(
                    title: message,
                    detail: OnboardingFailure.message(message).detail,
                    actionTitle: "Try again",
                    onAction: { model.retryInvite() },
                    identifier: "state.error"
                )
                .padding(.horizontal, 18)
                .padding(.top, 120)
            }
        }
    }

    private var header: some View {
        Wordmark(width: 92)
            .frame(maxWidth: .infinity)
            .padding(.top, 44)
            .padding(.bottom, 34)
    }

    private var welcomeCopy: some View {
        VStack(spacing: 12) {
            Text("Be the friend who says yes.")
                .font(.system(size: 42, weight: .heavy, design: .serif))
                .multilineTextAlignment(.center)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("join.title")
                .fixedSize(horizontal: false, vertical: true)
            Text("Frolic plans your hangouts. No asking, no deciding, no flaking.")
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("join.blurb")
        }
        .padding(.horizontal, 26)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var bar: some View {
        switch model.invitePhase {
        case .ready:
            Button(model.preview.map { "Join \($0.groupName)" } ?? (model.link == nil ? "Start a crew" : "Join your crew")) {
                if model.link == nil { model.startSolo() } else { model.acceptInvite() }
            }
            .buttonStyle(.frolicPrimary)
            .accessibilityIdentifier("join.join")
            if model.link == nil {
                Button("I have an invite link") { model.showsInviteEntry = true }
                    .buttonStyle(.frolicText)
                    .accessibilityIdentifier("join.haveLink")
            }
        case .offline, .expired, .invalid:
            Button("Start on your own") { model.startSolo() }
                .buttonStyle(.frolicPrimary)
                .accessibilityIdentifier("join.join")
            Button("I have an invite link") { model.showsInviteEntry = true }
                .buttonStyle(.frolicText)
                .accessibilityIdentifier("join.haveLink")
        default:
            EmptyView()
        }
    }
}

struct InviteEntrySheet: View {
    @Bindable var model: OnboardingModel
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Paste your invite link")
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            TextField("Invite link", text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .focused($focused)
                .padding(.horizontal, 16)
                .frame(height: 56)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(FrolicColor.paper))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
                .accessibilityIdentifier("join.linkField")
            Button("Find my crew") { model.submitInviteLink(text) }
                .buttonStyle(.frolicPrimary)
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityIdentifier("join.findCrew")
        }
        .padding(.horizontal, 18)
        .padding(.top, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(FrolicColor.cream.ignoresSafeArea())
        .onAppear { focused = true }
    }
}
