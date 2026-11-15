import SwiftUI

struct YouScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var model = YouModel()
    @State private var showsPrivacy = false
    @State private var showsTaste = false
    @State private var onboarding: OnboardingModel?
    @State private var retries = 0

    private var shownPhase: ScreenPhase {
        router.resolve(model.loadPhase, isOnline: connectivity.isOnline)
    }

    private let copy = PlaceholderCopy(
        loading: "Loading your flower",
        emptyTitle: "No flower yet",
        emptyMessage: "Frolic plants your flower when you join a crew.",
        emptyAction: "Make your flower",
        errorTitle: "Couldn't load your profile"
    )

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, 18)
            .padding(.top, 24)
            .padding(.bottom, 140)
        }
        .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 90) }
        .background(SkyBackground())
        .accessibilityIdentifier("you.screen")
        .task(id: "\(router.e2eRoute?.screen ?? "")\(FrolicIdentity.shared.deviceToken)\(retries)") { await model.run(backend: backend, router: router) }
        .sheet(isPresented: $showsPrivacy) {
            YouPrivacyScreen(model: model)
        }
        .fullScreenCover(item: $onboarding) { onboarding in
            OnboardingView(model: onboarding)
                .overlay(alignment: .topTrailing) {
                    Button("Back") { self.onboarding = nil }
                        .buttonStyle(.frolicText)
                        .padding(.top, 8)
                        .padding(.trailing, 8)
                        .accessibilityIdentifier("you.onboarding.back")
                }
        }
        .sheet(isPresented: $showsTaste) {
            YouTasteSheet(model: model)
        }
    }

    @ViewBuilder
    private var content: some View {
        let phase = shownPhase
        if model.loadPhase == .ready, phase == .ready || phase == .offline {
            YouContent(
                model: model,
                offline: phase == .offline,
                onPrivacy: { showsPrivacy = true },
                onTaste: { showsTaste = true },
                onGallery: { router.showsGallery = true }
            )
        } else {
            PhasePlaceholder(
                phase: phase,
                copy: copy,
                color: model.myColor,
                onEmptyAction: {
                    let created = OnboardingModel(backend: OnboardingBackend(client: backend.client))
                    created.onFinish = { onboarding = nil }
                    onboarding = created
                },
                onRetry: { retries += 1 }
            )
            .padding(.top, 40)
        }
    }
}

private struct YouContent: View {
    @Bindable var model: YouModel
    @Environment(FrolicBackend.self) private var backend
    var offline: Bool
    var onPrivacy: () -> Void
    var onTaste: () -> Void
    var onGallery: () -> Void

    @ScaledMetric(relativeTo: .title) private var nameSize: CGFloat = 28
    @ScaledMetric(relativeTo: .body) private var cardTitleSize: CGFloat = 16
    @Environment(\.dynamicTypeSize) private var typeSize

    private var travelLabel: String {
        model.travel.map { "\(Int($0)) min by foot or BART" } ?? "Choose"
    }

    private var limitsNote: String {
        "Plans quietly fit everyone's limits. Nobody has to say \"I can't afford that.\""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if offline {
                YouBanner(
                    systemImage: "wifi.slash",
                    title: "You're offline",
                    message: "Your limits are saved on your phone."
                )
                .padding(.top, 18)
                .accessibilityIdentifier("state.offline")
            }
            card
                .padding(.top, 18)
            SectionHeader(title: "Only you see these", systemImage: "lock.fill")
                .accessibilityIdentifier("you.privateHeader")
            limitsGroup
            if model.savePhase == .failed {
                Button {
                    model.retrySave(backend: backend)
                } label: {
                    YouBanner(
                        systemImage: "arrow.clockwise",
                        title: "Couldn't save that",
                        message: "Tap to try again."
                    )
                }
                .buttonStyle(.plain)
                .padding(.top, 12)
                .accessibilityIdentifier("you.limits.error")
            } else {
                YouNote(text: limitsNote, identifier: "you.limitsNote")
            }
            SectionHeader(title: "What you're into")
                .accessibilityIdentifier("you.taste")
            tasteSection
            SectionHeader(title: "Privacy")
            privacyGroup
            #if DEBUG || E2E
            Button(action: onGallery) {
                Label("Component gallery", systemImage: "square.grid.2x2")
            }
            .buttonStyle(.frolicText)
            .frame(maxWidth: .infinity)
            .padding(.top, 20)
            .accessibilityIdentifier("you.gallery")
            #endif
        }
    }

    private var identityLine: String? {
        guard let crew = model.crewName else { return nil }
        guard let count = model.wentCount else { return crew }
        if count == 0 { return "Your first frolic is one tap away." }
        return "\(count) \(count == 1 ? "frolic" : "frolics") with \(crew)"
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            YouFlowerHead(
                name: model.profile?.name ?? "You",
                color: model.myColor,
                photoURL: model.profile?.photoUrl,
                radius: 36
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(model.profile?.name ?? "You")
                    .font(.system(size: nameSize, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("you.title")
                if let line = identityLine {
                    Text(line)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var hasWent: Bool {
        (model.wentCount ?? 0) > 0
    }

    private var card: some View {
        FrolicCard {
            HStack(spacing: 12) {
                if model.card.went {
                    HStack(spacing: 0) {
                        ForEach(model.card.people.indices, id: \.self) { index in
                            let person = model.card.people[index]
                            YouFlowerHead(
                                name: person.name,
                                color: person.color,
                                photoURL: person.photoUrl,
                                radius: 19
                            )
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text((model.wentCount ?? 1) <= 1 ? "Your first frolic" : "Today's frolic")
                            .font(.system(size: cardTitleSize, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                        Text(model.card.friendLine)
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    YouFlowerHead(
                        name: model.profile?.name ?? "You",
                        color: model.myColor,
                        photoURL: nil,
                        radius: 16,
                        state: .bud
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hasWent ? "Your flower is growing" : "No frolics yet")
                            .font(.system(size: cardTitleSize, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                        Text(hasWent ? "It blooms again the next time you go." : "Your first flower grows the first time you go.")
                            .frolicFont(.subheadline)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("you.card")
    }

    private var limitsGroup: some View {
        FrolicGroup {
            YouSettingRow(showsDivider: false) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Spend up to")
                        .frolicFont(.body)
                        .foregroundStyle(FrolicColor.ink)
                    FrolicSegmented(
                        label: "Spend up to",
                        options: YouBudget.allCases.map {
                            (value: Optional($0), title: $0.label, identifier: Optional($0.identifier))
                        },
                        selection: Binding(
                            get: { model.budget },
                            set: { value in
                                guard let value else { return }
                                model.choose(budget: value)
                                model.save(backend: backend)
                            }
                        )
                    )
                    .accessibilityIdentifier("you.budget")
                }
            }
            YouSettingRow {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Energy")
                        .frolicFont(.body)
                        .foregroundStyle(FrolicColor.ink)
                    FrolicSegmented(
                        label: "Energy",
                        options: YouEnergyChoice.allCases.map {
                            (value: Optional($0), title: $0.label, identifier: Optional($0.identifier))
                        },
                        selection: Binding(
                            get: { model.energy },
                            set: { value in
                                guard let value else { return }
                                model.choose(energy: value)
                                model.save(backend: backend)
                            }
                        )
                    )
                    .accessibilityIdentifier("you.energy")
                }
            }
            YouSettingRow {
                VStack(alignment: .leading, spacing: 8) {
                    YouValueRow(label: "Travel up to") {
                        Text(travelLabel)
                            .frolicFont(.body)
                            .foregroundStyle(FrolicColor.secondaryText)
                            .multilineTextAlignment(.trailing)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Slider(
                        value: Binding(
                            get: { model.travel ?? 5 },
                            set: { value in
                                model.choose(travel: value)
                                model.save(backend: backend)
                            }
                        ),
                        in: 5...45,
                        step: 5
                    )
                    .tint(FrolicColor.ink)
                    .opacity(model.travel == nil ? 0.45 : 1)
                    .accessibilityLabel("Travel up to")
                    .accessibilityValue(travelLabel)
                    .accessibilityIdentifier("you.travel")
                }
            }
            YouSettingRow {
                YouValueRow(label: "Home by") {
                    Menu {
                        ForEach(YouHomeBy.allCases, id: \.self) { option in
                            Button(option.label) {
                                model.choose(homeBy: option)
                                model.save(backend: backend)
                            }
                        }
                    } label: {
                        YouMenuValue(text: model.homeBy?.label ?? "Choose")
                    }
                    .accessibilityLabel("Home by")
                    .accessibilityValue(model.homeBy?.label ?? "Not set")
                    .accessibilityIdentifier("you.homeBy")
                }
            }
        }
    }

    private var tasteSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.tasteTags.isEmpty {
            } else {
                FlowLayout(spacing: 6) {
                    ForEach(model.tasteTags, id: \.self) { tag in
                        FrolicChip(text: tag, size: .big)
                    }
                }
                .padding(.horizontal, 2)
            }
            Button("Pick photos again", action: onTaste)
                .buttonStyle(.frolicText)
                .padding(.top, 6)
                .accessibilityIdentifier("you.repick")
        }
    }

    private var privacyGroup: some View {
        FrolicGroup {
            Button(action: onPrivacy) {
                YouSetupRow(
                    label: "What friends can see",
                    value: "",
                    identifier: "you.privacy"
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
    }
}
extension OnboardingModel: Identifiable {}
