import SwiftUI

struct YouScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var model = YouModel()
    @State private var showsPrivacy = false
    @State private var showsTaste = false

    private var shownPhase: ScreenPhase {
        router.resolve(model.loadPhase, isOnline: connectivity.isOnline)
    }

    private let copy = PlaceholderCopy(
        loading: "Loading your flower",
        emptyTitle: "No flower yet",
        emptyMessage: "Frolic plants your flower when you join a crew.",
        emptyAction: nil,
        errorTitle: "Couldn't load your profile"
    )

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .padding(.horizontal, 18)
            .padding(.top, 96)
            .padding(.bottom, 120)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("you.screen")
        .task(id: "\(router.e2eRoute?.screen ?? "")\(FrolicIdentity.shared.deviceToken)") { await model.run(backend: backend, router: router) }
        .sheet(isPresented: $showsPrivacy) {
            YouPrivacyScreen(model: model)
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
                onRetry: { Task { await model.run(backend: backend, router: router) } }
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
        "\(Int(model.travel)) min by foot or BART"
    }

    private var limitsNote: String {
        "Plans quietly fit everyone's limits. Nobody has to say \"I can't afford that.\""
    }

    private var calendarNote: String {
        model.readCalendar
            ? "Frolic only shares \"free\" or \"busy,\" never what's on your calendar."
            : "You'll pick when you're free from the pill on Today."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if offline {
                YouBanner(
                    systemImage: "wifi.slash",
                    title: "You're offline",
                    message: "Your limits are saved on your phone and go back up when you're online."
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
            SectionHeader(title: "Free time")
            freeTimeGroup
            YouNote(
                text: calendarNote,
                identifier: model.readCalendar ? "you.calendarNote" : "you.calendarOffNote"
            )
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
                if let crew = model.crewName {
                    Text(crew)
                        .frolicFont(.subheadline)
                        .foregroundStyle(FrolicColor.secondaryText)
                }
            }
            Spacer(minLength: 0)
        }
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
                        Text("Your first frolic")
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
                        Text("No frolics yet")
                            .font(.system(size: cardTitleSize, weight: .semibold))
                            .foregroundStyle(FrolicColor.ink)
                        Text("Your first flower grows the first time you go.")
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
                            (value: $0, title: $0.label, identifier: Optional($0.identifier))
                        },
                        selection: Binding(
                            get: { model.budget },
                            set: { value in
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
                            (value: $0, title: $0.label, identifier: Optional($0.identifier))
                        },
                        selection: Binding(
                            get: { model.energy },
                            set: { value in
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
                            get: { model.travel },
                            set: { value in
                                model.choose(travel: value)
                                model.save(backend: backend)
                            }
                        ),
                        in: 5...45,
                        step: 5
                    )
                    .tint(FrolicColor.ink)
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
                        YouMenuValue(text: model.homeBy.label)
                    }
                    .accessibilityLabel("Home by")
                    .accessibilityValue(model.homeBy.label)
                    .accessibilityIdentifier("you.homeBy")
                }
            }
        }
    }

    private var freeTimeGroup: some View {
        FrolicGroup {
            YouSettingRow(showsDivider: false) {
                Toggle(isOn: Binding(
                    get: { model.readCalendar },
                    set: { model.setReadCalendar($0) }
                )) {
                    Text("Read my calendar")
                        .frolicFont(.body)
                        .foregroundStyle(FrolicColor.ink)
                }
                .toggleStyle(.switch)
                .tint(FrolicColor.free)
                .frame(minHeight: 44)
                .accessibilityIdentifier("you.calendarSwitch")
            }
            YouSettingRow {
                YouValueRow(label: "Daily plan arrives") {
                    Menu {
                        ForEach(YouDropTime.allCases, id: \.self) { option in
                            Button(option.label) {
                                model.choose(dropTime: option)
                            }
                        }
                    } label: {
                        YouMenuValue(text: model.dropTime.label)
                    }
                    .accessibilityLabel("Daily plan arrives")
                    .accessibilityValue(model.dropTime.label)
                    .accessibilityIdentifier("you.dropTime")
                }
            }
        }
    }

    private var tasteSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.tasteTags.isEmpty {
                Text("Pick photos and Frolic learns what you like.")
                    .frolicFont(.subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.horizontal, 4)
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
                    value: "Permissions and your data",
                    identifier: "you.privacy"
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
    }
}
