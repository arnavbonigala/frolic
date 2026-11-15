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
        HStack {
            Wordmark(width: 92)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
        .padding(.bottom, 28)
    }

    private var welcomeCopy: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Be the friend who says yes.")
                .font(.system(size: 46, weight: .heavy, design: .rounded))
                .tracking(-1)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("join.title")
                .fixedSize(horizontal: false, vertical: true)
            Text("Your crew, outside, more often.")
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .accessibilityIdentifier("join.blurb")
        }
        .padding(.horizontal, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var bar: some View {
        switch model.invitePhase {
        case .ready:
            Button(model.preview.map { "Join \($0.groupName)" } ?? "Get started") {
                if model.preview == nil { model.startSolo() } else { model.acceptInvite() }
            }
            .buttonStyle(.frolicPrimary)
            .accessibilityIdentifier("join.join")
        case .offline, .expired, .invalid:
            Button("Start on your own") { model.startSolo() }
                .buttonStyle(.frolicPrimary)
                .accessibilityIdentifier("join.join")
        default:
            EmptyView()
        }
    }
}
