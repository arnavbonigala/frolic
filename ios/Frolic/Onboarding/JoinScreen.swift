import SwiftUI

struct JoinScreen: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        ScrollView {
            content
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(SkyBackground().ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingBottomBar { bar }
        }
        .sheet(isPresented: $model.showsInviteEntry) {
            InviteEntrySheet(model: model)
        }
    }

    private var content: some View {
        VStack(spacing: 0) {
            header
            meadow
            switch model.invitePhase {
            case .ready:
                if model.isSolo {
                    soloCopy
                } else {
                    inviteCopy
                }
                captionCard
                    .padding(.horizontal, 18)
                    .padding(.top, 18)
            case .loading:
                VStack(spacing: 12) {
                    HStack(spacing: 10) {
                        OnboardingSpinner()
                        Text("Looking for your crew")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Looking for your crew")
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 42)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("state.loading")
            case .offline:
                PhasePlaceholder(
                    phase: .offline,
                    copy: PlaceholderCopy(
                        loading: "Looking for your crew",
                        emptyTitle: "No crew yet",
                        emptyMessage: "Start on your own and invite friends later.",
                        emptyAction: "Start on your own",
                        errorTitle: "Something got in the way."
                    ),
                    color: .pink,
                    onRetry: { model.retryInvite() }
                )
            case .expired:
                PhasePlaceholder(
                    phase: .error("Ask whoever invited you for a fresh link, or start your own crew."),
                    copy: PlaceholderCopy(
                        loading: "Looking for your crew",
                        emptyTitle: "No crew yet",
                        emptyMessage: "Start on your own and invite friends later.",
                        emptyAction: "Start on your own",
                        errorTitle: "This invite link expired"
                    ),
                    color: .pink,
                    onRetry: { model.retryInvite() }
                )
            case .invalid:
                PhasePlaceholder(
                    phase: .error("Check the link, or start your own crew."),
                    copy: PlaceholderCopy(
                        loading: "Looking for your crew",
                        emptyTitle: "No crew yet",
                        emptyMessage: "Start on your own and invite friends later.",
                        emptyAction: "Start on your own",
                        errorTitle: "That invite link isn't one we know"
                    ),
                    color: .pink,
                    onRetry: { model.retryInvite() }
                )
            case .failed(let message):
                PhasePlaceholder(
                    phase: .error(message),
                    copy: PlaceholderCopy(
                        loading: "Looking for your crew",
                        emptyTitle: "No crew yet",
                        emptyMessage: "Start on your own and invite friends later.",
                        emptyAction: "Start on your own",
                        errorTitle: "Something got in the way."
                    ),
                    color: .pink,
                    onRetry: { model.retryInvite() }
                )
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
    }

    private var members: [InvitePreview.Member] {
        if let preview = model.preview, !preview.members.isEmpty { return preview.members }
        return [
            .init(name: "Maya", color: "pink"),
            .init(name: "Dev", color: "cobalt"),
            .init(name: "Jordan", color: "moss"),
            .init(name: "Priya", color: "marigold"),
        ]
    }

    private var meadow: some View {
        ZStack(alignment: .bottom) {
            if let painting = UIImage(named: "launch-meadow") {
                Image(uiImage: painting)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 250)
                    .clipped()
                    .accessibilityHidden(true)
                HStack(spacing: 0) {
                    ForEach(Array(members.enumerated()), id: \.offset) { _, member in
                        Text(member.name)
                            .frolicFont(.flowerName)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 4)
            } else {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(Array(members.enumerated()), id: \.offset) { index, member in
                        FlowerView(
                            state: .bloom,
                            person: FlowerPerson(name: member.name, color: FlowerColor(rawValue: member.color) ?? .pink),
                            radius: 34,
                            stem: [110, 66, 130, 86][index % 4],
                            showsName: true,
                            swayDelay: Double(index) * 0.5,
                            animatesIn: true
                        )
                        .frame(maxWidth: .infinity)
                    }
                }
                .frame(height: 250, alignment: .bottom)
                .padding(.horizontal, 14)
            }
        }
        .frame(height: 250)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private var inviteCopy: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(invitedByLine)
                .frolicFont(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityIdentifier("join.invitedBy")
            Text(model.preview?.groupName ?? "Sunset Crew")
                .font(.system(size: 46, weight: .heavy, design: .rounded))
                .tracking(-1)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("join.title")
                .fixedSize(horizontal: false, vertical: true)
            Text(Self.blurb)
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 12)
                .accessibilityIdentifier("join.blurb")
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        
    }

    private var soloCopy: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("No invite? Start here")
                .frolicFont(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityIdentifier("join.invitedBy")
            Text("Just you for now")
                .font(.system(size: 46, weight: .heavy, design: .rounded))
                .tracking(-1)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("join.title")
                .fixedSize(horizontal: false, vertical: true)
            Text(Self.blurb)
                .frolicFont(.body)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 12)
                .accessibilityIdentifier("join.blurb")
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 22)
        .padding(.top, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        
    }

    private var invitedByLine: String {
        "\(model.preview?.invitedBy ?? "Maya") invited you to"
    }

    private var captionCard: some View {
        HStack(alignment: .top, spacing: 4) {
            caption(
                identifier: "join.caption.free",
                text: "Friends who are free bloom"
            ) {
                FlowerView(state: .bloom, color: .pink, radius: 17, stem: 0)
            }
            caption(
                identifier: "join.caption.bud",
                text: "Your yes is a secret bud"
            ) {
                FlowerView(state: .bud, color: .tomato, radius: 15, stem: 22)
            }
            caption(
                identifier: "join.caption.on",
                text: "Both yes: it's on"
            ) {
                HStack(spacing: -8) {
                    FlowerView(state: .bloom, color: .tomato, radius: 14, stem: 0)
                    FlowerView(state: .bloom, color: .cobalt, radius: 14, stem: 0)
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity)
        .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
        .shadow(color: Color(hex: 0x78501E, opacity: 0.08), radius: 13, y: 10)
    }

    private func caption<Icon: View>(
        identifier: String,
        text: String,
        @ViewBuilder icon: () -> Icon
    ) -> some View {
        VStack(spacing: 4) {
            icon()
                .frame(height: 52, alignment: .bottom)
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(FrolicColor.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(identifier)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var bar: some View {
        VStack(spacing: 4) {
            if model.isSolo || model.invitePhase == .offline || model.invitePhase == .expired || model.invitePhase == .invalid {
                Button("Start on your own") { model.startSolo() }
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("join.join")
                Button("I have an invite link") { model.showsInviteEntry = true }
                    .buttonStyle(.frolicText)
                    .accessibilityIdentifier("join.solo")
            } else if case .ready = model.invitePhase {
                Button("Join \(model.preview?.groupName ?? "the crew")") { model.acceptInvite() }
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("join.join")
                Button("No invite? Start on your own") { model.startSolo() }
                    .buttonStyle(.frolicText)
                    .accessibilityIdentifier("join.solo")
            }
        }
    }

    static let blurb = "Every afternoon, one plan for whoever's free. Say you're down in secret. It only happens if a friend is down too."
}

struct InviteEntrySheet: View {
    @Bindable var model: OnboardingModel
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Your invite link")
                .frolicFont(.sheetTitle)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Paste the link a friend sent you.")
                .frolicFont(.subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
            TextField("frolic.app/j/", text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .frolicFont(.body)
                .padding(.horizontal, 16)
                .frame(height: 54)
                .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(FrolicColor.line, lineWidth: 1))
                .accessibilityIdentifier("invite.field")
            Button("Use this link") {
                model.submitInviteLink(text)
                dismiss()
            }
            .buttonStyle(.frolicPrimary)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.height(300)])
        .presentationBackground(FrolicColor.cream)
    }
}
