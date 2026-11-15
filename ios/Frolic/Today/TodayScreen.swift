import SwiftUI

struct TodayScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @Environment(FrolicIdentity.self) private var identity
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = TodayStore()

    private var route: E2ERoute? {
        guard let route = router.e2eRoute, route.screen == "today" else { return nil }
        return route
    }

    private var shown: ScreenPhase {
        if let override = router.phaseOverride { return override }
        if !connectivity.isOnline && store.today == nil { return .offline }
        return store.load
    }

    private var bleeds: Bool {
        guard shown == .ready else { return false }
        switch store.scene {
        case .open, .waiting, .solo: return store.plan != nil
        case .none: return !(store.startingPlan || (store.frolic != nil && store.plan == nil))
        default: return false
        }
    }

    var body: some View {
        @Bindable var store = store
        GeometryReader { geometry in
        ZStack(alignment: .top) {
            ScrollView {
                if bleeds {
                    ZStack(alignment: .top) {
                        VStack(spacing: 0) { content }
                        TodayTopBar(store: store, ready: true)
                            .padding(.top, geometry.safeAreaInsets.top)
                    }
                    .padding(.bottom, 32)
                } else {
                    VStack(spacing: 0) {
                        TodayTopBar(store: store, ready: shown == .ready)
                        content
                    }
                    .padding(.bottom, 32)
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.hidden)
            .scrollDisabled(bleeds && (store.scene == .open || store.scene == .none) && !dynamicTypeSize.isAccessibilitySize)
            .contentMargins(.bottom, 0, for: .scrollContent)
            .ignoresSafeArea(edges: bleeds ? .top : [])
            if !connectivity.isOnline && store.today != nil && router.phaseOverride == nil {
                TodayOfflineBanner()
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            TodayBloomOverlay(trigger: store.bloomID)
                .allowsHitTesting(false)
        }
        }
        .overlay(alignment: .bottom) {
            if let notice = store.notice {
                TodayNotice(text: notice)
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { store.dismissNotice() }
                    .accessibilityLabel(notice)
                    .accessibilityAction(named: "Dismiss") { store.dismissNotice() }
                    .accessibilityIdentifier("today.notice")
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: store.notice)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: connectivity.isOnline)
        .background {
            if bleeds {
                StoryColor.page
                    .overlay(NightStars().padding(.top, 280))
                    .ignoresSafeArea()
                    .accessibilityHidden(true)
            } else {
                SkyBackground()
            }
        }
        .accessibilityIdentifier("today.screen")
        .environment(\.todayOnline, connectivity.isOnline)
        .task(id: routeKey) {
            if let location = router.simulatedLocation {
                store.walkFrom = (location.latitude, location.longitude)
            }
            store.start(backend: backend, route: route)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.becameActive() }
        }
        .onAppear { store.takePendingAction() }
        .task(id: store.meMember?.photoUrl) { await MyAvatar.shared.load(store.meMember?.photoUrl) }
        .onReceive(NotificationCenter.default.publisher(for: TodayInbox.openOnlyIfNotification)) { _ in
            store.takePendingAction()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("frolic.garden.imFree"))) { _ in
            router.tab = .today
            store.sheet = .imFree
        }
        .sheet(item: $store.sheet) { sheet in
            TodaySheetHost(sheet: sheet, store: store)

        }
        .sheet(item: Binding(get: { store.payPage }, set: { if $0 == nil { store.closePayPage() } })) { page in
            TodaySafari(url: page.url)
                .ignoresSafeArea()
        }
    }

    private var routeKey: String {
        let session = identity.deviceToken + "|" + (identity.groupId ?? "")
        guard let route else { return "live|" + session }
        return session + "|\(route.state ?? "")|\(route.query.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&"))"
    }

    @ViewBuilder
    private var content: some View {
        switch shown {
        case .loading:
            TodaySkeleton()
        case .error(let message):
            TodayErrorState(message: message) { store.retry(backend: backend, route: route) }
        case .offline:
            PhasePlaceholder(
                phase: .offline,
                copy: PlaceholderCopy(loading: "", emptyTitle: "", emptyMessage: "", errorTitle: ""),
                onRetry: { store.retry(backend: backend, route: route) }
            )
        case .empty:
            TodayNoPlanStart(store: store)
        case .ready:
            TodayPhaseView(store: store, router: router)

        }
    }
}

private struct TodayOnlineKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var todayOnline: Bool {
        get { self[TodayOnlineKey.self] }
        set { self[TodayOnlineKey.self] = newValue }
    }
}

private struct TodayTopBar: View {
    var store: TodayStore
    var ready: Bool
    @Environment(FrolicBackend.self) private var backend
    @State private var crews = CrewSwitcherModel()

    var body: some View {
        HStack {
            if crews.crews.count > 1, let current = crews.current {
                CrewSwitchMenu(model: crews) {
                    HStack(spacing: 6) {
                        Text(current.name)
                            .todayFont(16, .bold, rounded: true, relativeTo: .headline)
                            .lineLimit(1)
                        if crews.othersWaiting > 0 {
                            Image(systemName: "sparkles")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(StoryColor.accent)
                        }
                        Image(systemName: "chevron.down")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundStyle(StoryColor.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .glassEffect(.regular.tint(FrolicColor.cream.opacity(0.55)).interactive(), in: .capsule)
                }
                .accessibilityLabel(crews.othersWaiting > 0 ? "\(current.name). Another crew has a plan waiting. Switch crew" : "\(current.name). Switch crew")
                .accessibilityIdentifier("today.crewSwitch")
            } else {
                Wordmark(color: StoryColor.ink, width: 74)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .glassEffect(.regular.tint(FrolicColor.cream.opacity(0.55)), in: .capsule)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Frolic")
            }
            Spacer()
            if ready {
                if store.scene == .done {
                    StatusPill(text: "Went today")
                        .accessibilityIdentifier("today.freePill")
                } else {
                    Button {
                        store.sheet = .free
                    } label: {
                        StatusPill(text: TodayCopy.freeLabel(store.myFree), isFree: store.myFree?.state != "busy")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(TodayCopy.freeLabel(store.myFree)). Change when you're free")
                    .accessibilityIdentifier("today.freePill")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .task { crews.start(backend: backend) }
    }
}

private struct TodayOfflineBanner: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.slash")
                .accessibilityHidden(true)
            Text("You're offline.")
        }
        .todayFont(13, .semibold, relativeTo: .footnote)
        .foregroundStyle(FrolicColor.cream)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Capsule().fill(FrolicColor.ink.opacity(0.9)))
        .padding(.horizontal, 18)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("state.offline")
    }
}

private struct TodayPhaseView: View {
    var store: TodayStore
    var router: AppRouter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch store.scene {
            case .none:
                TodayNoPlanStart(store: store)
            case .solo(let waiting):
                TodaySoloView(store: store, waiting: waiting)
            case .off:
                TodayOffView(store: store)
            case .open:
                TodayOpenView(store: store, router: router)
            case .waiting(let onlyIf):
                TodayWaitingView(store: store, onlyIf: onlyIf, router: router)
            case .on:
                TodayOnView(store: store)
            case .arrived:
                TodayArrivedView(store: store)
            case .hopIn:
                TodayHopInView(store: store)
            case .faded:
                TodayFadedView(store: store)
            case .done:
                TodayDoneView(store: store, router: router)
            }
        }
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 8)))
        .animation(.easeOut(duration: reduceMotion ? 0.2 : 0.35), value: store.scene)
    }
}

private struct TodayPlanPacket: View {
    var store: TodayStore
    var label: String?
    var number: String?
    var showsWhy = true
    var hostedBy: String?
    var friends: [TodayPerson] = []
    var friendsLine: String?
    var onFriends: (() -> Void)?
    var buds: [TodayPerson] = []
    var me: TodayPerson?
    var onFlickUp: (() -> Void)?
    var onFlickDown: (() -> Void)?
    var onOnlyWith: (() -> Void)?
    var teaches = false

    var body: some View {
        let plan = store.plan
        let title = plan?.title ?? ""
        TodayPacket(
            label: label ?? TodayCopy.weekday(plan?.startsAt ?? store.now()),
            number: number ?? store.today?.frolicNumber.map { "Crew frolic No. \(Int($0))" } ?? store.today?.groupName,
            hero: TodayCopy.heroAsset(plan),
            heroURL: plan?.place?.photoUrl,
            heroDescription: title,
            showsWhy: showsWhy,
            why: plan?.why,
            friends: friends,
            friendsLine: friendsLine,
            onFriends: onFriends,
            buds: buds,
            me: me,
            onFlickUp: onFlickUp,
            onFlickDown: onFlickDown,
            onOnlyWith: onOnlyWith,
            teaches: teaches
        ) {
            Text(title)
                .storyFont(title.count > 22 ? 28 : 31)
                .foregroundStyle(StoryColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let line = plan?.line, !line.isEmpty {
                Text(line)
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(StoryColor.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("today.plan.line")
            }
            if let plan {
                HStack(alignment: .top, spacing: 0) {
                    stat(value: TodayCopy.clock(plan.startsAt), label: "Starts")
                    stat(value: plan.costLabel, label: "Cost")
                    if let walk = store.walkMinutes {
                        stat(value: "\(Int(walk)) min", label: "Walk")
                    } else if let sunset = plan.sunsetAt {
                        stat(value: TodayCopy.clock(sunset), label: "Sunset")
                    } else if let area = plan.place?.neighborhood {
                        stat(value: area, label: "Where")
                    }
                }
                .padding(.top, 10)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("today.plan.chips")
            }
            if let hostedBy = hostedBy ?? store.drop?.hostedBy {
                Text(hostedBy.hasPrefix("Hosted by") ? hostedBy : "Hosted by \(hostedBy)")
                    .todayFont(13, .semibold, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.chipText)
                    .accessibilityIdentifier("today.plan.hostedBy")
            }
        }
    }
}

private func stat(value: String, label: String) -> some View {
    VStack(alignment: .center, spacing: 2) {
        Text(value)
            .todayFont(20, .bold, rounded: true, relativeTo: .title3)
            .foregroundStyle(StoryColor.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        Text(label)
            .todayFont(13, .medium, rounded: true, relativeTo: .caption)
            .foregroundStyle(StoryColor.muted)
    }
    .frame(maxWidth: .infinity, alignment: .center)
}

private struct TodayHush: View {
    var text: String
    var identifier: String

    var body: some View {
        HushNote(text: text)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .accessibilityIdentifier(identifier)
    }
}

private struct TodayOpenView: View {
    var store: TodayStore
    var router: AppRouter
    @Environment(\.todayOnline) private var online
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let free = store.freeFriends
        VStack(spacing: 0) {
            if store.frolic?.origin == "free", let notice = store.frolic?.notice {
                Text(notice)
                    .todayFont(15, .semibold, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 22)
                    .padding(.top, 10)
                    .accessibilityIdentifier("today.freeNotice")
            }
            TodayPlanPacket(
                store: store,
                friends: free,
                friendsLine: store.crew == nil ? nil : free.isEmpty ? "Nobody's free yet. Your yes still counts." : TodayCopy.names(free.map(\.name)) + (free.count == 1 ? " is free" : " are free"),
                onFriends: { router.tab = .crew },
                me: store.mePerson,
                onFlickUp: online ? { store.seeHint(); store.tapDown(onlyIf: []) } : nil,
                onFlickDown: online ? { store.setFree("busy", window: nil) } : nil,
                onOnlyWith: online ? { store.picks = []; store.sheet = .onlyIf } : nil,
                teaches: !store.hintSeen
            )
            VStack(spacing: 2) {
                if dynamicTypeSize.isAccessibilitySize {
                    Button("I'm down") {
                        store.seeHint()
                        store.tapDown(onlyIf: [])
                    }
                    .buttonStyle(.frolicPrimary)
                }
            }
            .disabled(!online)
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }
}

private struct TodayTomorrowRow: View {
    var store: TodayStore

    var body: some View {
        if let tomorrow = store.tomorrow, let plan = tomorrow.frolic?.plan {
            let going = (tomorrow.reveal?.going ?? []).filter { $0.userId != store.meMember?.userId }.map(\.name)
            let text = going.isEmpty
                ? plan.title + " is looking likely."
                : TodayCopy.names(going) + (going.count == 1 ? " is going to " : " are going to ") + plan.title + ". There's room for you."
            HStack(spacing: 12) {
                TodayHeroImage(asset: TodayCopy.heroAsset(plan), remote: nil, description: nil)
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                (Text("Tomorrow: ").fontWeight(.bold).foregroundColor(FrolicColor.ink) + Text(text))
                    .todayFont(15, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(10)
            .frame(minHeight: 60)
            .background(FrolicColor.paper, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(FrolicColor.hairline, lineWidth: 0.5))
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("today.tomorrowRow")
        }
    }
}

private struct TodayWaitingView: View {
    var store: TodayStore
    var onlyIf: [String]
    var router: AppRouter
    @Environment(\.todayOnline) private var online

    var body: some View {
        VStack(spacing: 0) {
            TodayPlanPacket(
                store: store,
                showsWhy: false,
                friends: store.freeFriends,
                friendsLine: onlyIf.isEmpty ? "Waiting for a friend" : "Waiting for " + TodayCopy.names(onlyIf),
                onFriends: { router.tab = .crew },
                buds: [store.mePerson]
            )
            TodayStatusCard(
                title: TodayCopy.downLine(onlyIf),
                message: TodayCopy.downBody(onlyIf, deadline: store.frolic?.deadline),
                identifier: "today.status.down",
                bodyIdentifier: "today.status.downBody"
            )
            .padding(.horizontal, 16)
            .padding(.top, 14)
            Button("Take it back") { store.takeBack() }
                .buttonStyle(.frolicSecondaryWide)
                .disabled(!online)
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .accessibilityIdentifier("today.takeBack")
            Text("We'll tell you the moment it's on.")
                .todayFont(13, relativeTo: .footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .padding(.top, 8)
                .accessibilityIdentifier("today.next")
            TodayAnsweredSlot(store: store)
            TodayTomorrowRow(store: store)
        }
    }
}

private struct TodaySoloView: View {
    var store: TodayStore
    var waiting: Bool
    @Environment(\.todayOnline) private var online

    var body: some View {
        VStack(spacing: 0) {
            TodayMeadow(
                people: waiting ? [] : [store.mePerson],
                waiting: waiting,
                buds: waiting ? [store.mePerson] : [],
                slots: 3
            )
            .accessibilityIdentifier("today.meadow")
            TodayCaption(
                text: waiting ? "Waiting for a friend" : "Just you today",
                identifier: waiting ? "today.caption.waiting" : "today.freeRow",
                showsDots: waiting
            )
            .padding(.horizontal, 22)
            TodayPlanPacket(store: store, label: "Just for you", number: "Your first frolic", showsWhy: !waiting)
                .accessibilityIdentifier("today.solo.band")
            if waiting {
                TodayStatusCard(
                    title: "You're down",
                    message: "You're in. You'll know if anyone else is.",
                    identifier: "today.status.down",
                    bodyIdentifier: "today.status.downBody"
                )
                .padding(.horizontal, 16)
                .padding(.top, 14)
                Button("Send to the group chat") { openShare() }
                    .buttonStyle(.frolicPrimary)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .accessibilityIdentifier("today.solo.send")
                Button("Take it back") { store.takeBack() }
                    .buttonStyle(.frolicText)
                    .padding(.top, 4)
                    .accessibilityIdentifier("today.takeBack")
                TodayAnsweredSlot(store: store)
            } else {
                HStack(spacing: 10) {
                    Button("Send to the group chat") { openShare() }
                        .buttonStyle(.frolicPrimary)
                        .accessibilityIdentifier("today.solo.send")
                    Button("I'm down") { store.tapDown(onlyIf: []) }
                        .buttonStyle(.frolicSecondary)
                        .accessibilityIdentifier("today.solo.down")
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                TodayHush(text: "Your yes stays secret, even in the group chat", identifier: "today.hush")
            }
        }
        .disabled(!online)
    }

    private func openShare() {
        store.sheet = .share
        store.prepareShare()
    }
}

private struct TodayOffView: View {
    var store: TodayStore

    var body: some View {
        VStack(spacing: 0) {
            TodayMeadow(people: store.allFriends, waiting: false, folded: true)
                .padding(.top, 30)
            VStack(spacing: 10) {
                Text("Taking the day off")
                    .todayFont(30, .heavy, rounded: true, relativeTo: .title)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.off.title")
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 22)
            .padding(.top, 30)
            Button("I'm free after all") { store.freeAfterAll() }
                .buttonStyle(.frolicSecondaryWide)
                .padding(.horizontal, 16)
                .padding(.top, 22)
                .accessibilityIdentifier("today.off.back")
            TodayAnsweredSlot(store: store)
        }
    }
}

struct TodayAnsweredSlot: View {
    var store: TodayStore

    var body: some View {
        EmptyView()
    }
}

private struct TodayBunch: View {
    var people: [TodayPerson]
    var radius: CGFloat
    var stems: [CGFloat]
    var height: CGFloat
    var animatesIn: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: -radius * 0.35) {
            ForEach(Array(people.prefix(5).enumerated()), id: \.element.id) { index, person in
                TodayFlower(
                    person: person,
                    radius: radius,
                    stem: stems[index % stems.count],
                    name: person.name,
                    status: "going",
                    swayDelay: Double(index) * 0.5,
                    animatesIn: animatesIn,
                    appearDelay: 0.2 + Double(index) * 0.14
                )
                .zIndex(index == 1 ? 1 : 0)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height, alignment: .bottom)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.bunch")
    }
}

private struct TodayOnView: View {
    var store: TodayStore
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var cheered = false

    var body: some View {
        let people = store.goingPeople
        let plan = store.plan
        VStack(alignment: .leading, spacing: 0) {
            TodayBunch(people: people, radius: 50, stems: [70, 120, 90, 104], height: 290, animatesIn: store.bloomID > 0)
                .id(store.bloomID)
            VStack(alignment: .leading, spacing: 0) {
                Text((["You"] + store.goingFriendNames).count > 1 ? TodayCopy.names(["You"] + store.goingFriendNames) : "You")
                    .todayFont(15, .bold, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityIdentifier("today.on.who")
                Text("It's on.")
                    .todayFont(58, .heavy, rounded: true, relativeTo: .largeTitle)
                    .tracking(-1)
                    .foregroundStyle(FrolicColor.ink)
                    .minimumScaleFactor(0.6)
                    .scaleEffect(cheered || store.bloomID == 0 || reduceMotion ? 1 : 0.55, anchor: .bottomLeading)
                    .rotationEffect(.degrees(cheered || store.bloomID == 0 || reduceMotion ? 0 : -6), anchor: .bottomLeading)
                    .onAppear {
                        withAnimation(.spring(response: 0.55, dampingFraction: 0.55).delay(1.15)) { cheered = true }
                    }
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.on.title")
                meetLine(plan)
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .accessibilityIdentifier("today.on.details")
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            HStack(spacing: 10) {
                Button("I'm on my way") { store.onMyWay() }
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("today.on.otw")
                Button("Directions") { directions(plan) }
                    .buttonStyle(.frolicSecondary)
                    .accessibilityIdentifier("today.on.directions")
            }
            .padding(.horizontal, 16)
            .padding(.top, 20)
            if let plan {
                TodayRowLink(
                    thumb: TodayCopy.heroAsset(plan),
                    thumbRemote: plan.place?.photoUrl,
                    prefix: plan.title,
                    text: [plan.place?.name, plan.place?.neighborhood, store.walkMinutes.map { "\(Int($0)) min walk" }].compactMap { $0 }.joined(separator: " · "),
                    identifier: "today.on.plan",
                    action: { directions(plan) }
                )
                .padding(.horizontal, 16)
                .padding(.top, 18)
            }
            TodayMoneyCard(store: store)
                .padding(.horizontal, 16)
                .padding(.top, 16)
            TodayPainting(name: "state-its-on", height: 170)
                .frame(maxWidth: .infinity)
                .padding(.top, 14)
            Button("I can't make it") { store.sheet = .bail }
                .buttonStyle(.frolicText)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
                .accessibilityIdentifier("today.on.bail")
        }
    }

    private func meetLine(_ plan: TodayPlan?) -> Text {
        guard let plan else { return Text("") }
        let start = TodayCopy.clock(plan.startsAt)
        var text = Text(TodayCopy.meetPlace(plan) + " at ") + Text(start).fontWeight(.bold).foregroundColor(FrolicColor.ink)
        if let minutes = store.walkMinutes, minutes > 0 {
            let leave = TodayCopy.clock(plan.startsAt - minutes * 60_000)
            text = text + Text(". Leave by ") + Text(leave).fontWeight(.bold).foregroundColor(FrolicColor.ink)
        }
        if let tip = plan.tip {
            return text + Text(" and \(tip).")
        }
        return text + Text(".")
    }

    private func directions(_ plan: TodayPlan?) {
        guard let place = plan?.place else { return }
        let name = place.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "https://maps.apple.com/?daddr=\(place.lat),\(place.lng)&q=\(name)&dirflg=w") {
            openURL(url)
        }
    }
}

private struct TodayArrivedView: View {
    var store: TodayStore

    var body: some View {
        let here = store.arrivedFriendNames
        VStack(alignment: .leading, spacing: 0) {
            TodayBunch(people: store.goingPeople.filter { store.arrivedIds.contains($0.userId) }, radius: 50, stems: [70, 120, 90, 104], height: 290, animatesIn: false)
            VStack(alignment: .leading, spacing: 0) {
                Text("You made it.")
                    .todayFont(52, .heavy, rounded: true, relativeTo: .largeTitle)
                    .tracking(-1)
                    .foregroundStyle(FrolicColor.ink)
                    .minimumScaleFactor(0.6)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.arrived.title")
                Text(here.isEmpty ? "You're the first one here." : TodayCopy.names(here) + (here.count == 1 ? " is" : " are") + " here too.")
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .accessibilityIdentifier("today.arrived.who")
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            Button("Take the group snap") {
                CheckInFlowCoordinator.shared.openSnap(frolicId: store.frolic?.frolicId)
            }
            .buttonStyle(.frolicPrimary)
            .padding(.horizontal, 16)
            .padding(.top, 20)
            .accessibilityIdentifier("today.arrived.snap")
            Text("Everyone's shot unlocks when you add yours.")
                .todayFont(13, relativeTo: .footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
            TodayMoneyCard(store: store)
                .padding(.horizontal, 16)
                .padding(.top, 16)
        }
    }
}

private struct TodayHopInView: View {
    var store: TodayStore
    @Environment(\.todayOnline) private var online

    var body: some View {
        let reveal = store.reveal
        let goingNames = store.goingFriendNames
        let plan = store.plan
        let myName = store.meMember?.name ?? "Hey"
        VStack(spacing: 0) {
            TodayBunch(people: store.goingPeople, radius: 40, stems: [56, 92, 70, 84], height: 220, animatesIn: store.bloomID > 0)
                .id(store.bloomID)
            VStack(spacing: 8) {
                Text("\(myName), it's happening")
                    .todayFont(30, .heavy, rounded: true, relativeTo: .title)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("hopin.title")
                Text(TodayCopy.names(goingNames) + (goingNames.count == 1 ? " is going" : " are going"))
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .accessibilityIdentifier("hopin.body")
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 22)
            .padding(.top, 14)
            if let plan {
                TodayRowLink(
                    thumb: TodayCopy.heroAsset(plan),
                    thumbRemote: plan.place?.photoUrl,
                    prefix: plan.title + ":",
                    text: TodayCopy.meetPlace(plan) + " at " + TodayCopy.clock(plan.startsAt) + (plan.payUpFront ? ", " + plan.costLabel : "") + ".",
                    identifier: "hopin.plan",
                    action: {}
                )
                .allowsHitTesting(false)
                .accessibilityRemoveTraits(.isButton)
                .padding(.horizontal, 16)
                .padding(.top, 18)
            }
            if reveal?.me.hopInWaiting == true {
                TodayStatusCard(
                    title: "You're next in line",
                    message: "If someone sits out, the spot is yours."
                )
                .padding(.horizontal, 16)
                .padding(.top, 14)
            } else if reveal?.me.canHopIn == true || store.pending == .hopIn {
                Button(plan?.payUpFront == true ? "Hop in for \(plan?.costLabel.replacingOccurrences(of: " each", with: "") ?? "")" : "Hop in") {
                    store.hopIn()
                }
                .buttonStyle(.frolicPrimary)
                .disabled(!online)
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .accessibilityIdentifier("hopin.cta")
            } else {
                TodayStatusCard(
                    title: "It's full this time",
                    message: "Tomorrow's plan arrives at 3."
                )
                .padding(.horizontal, 16)
                .padding(.top, 14)
            }
        }
    }
}

private struct TodayFadedView: View {
    var store: TodayStore

    var body: some View {
        VStack(spacing: 0) {
            TodayMeadow(people: store.allFriends, waiting: false, folded: true)
                .padding(.top, 20)
            VStack(spacing: 10) {
                Text("This one drifted off")
                    .todayFont(30, .heavy, rounded: true, relativeTo: .title)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.faded.title")
                Text("This one drifted off.")
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .accessibilityIdentifier("today.faded.body")
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 22)
            .padding(.top, 34)
            TodayTomorrowRow(store: store)
        }
    }
}

private struct TodayDoneView: View {
    var store: TodayStore
    var router: AppRouter

    var body: some View {
        VStack(spacing: 0) {
            TodayBunch(people: store.goingPeople, radius: 36, stems: [50, 80, 64, 72], height: 210, animatesIn: false)
            VStack(spacing: 8) {
                Text("You went.")
                    .todayFont(30, .heavy, rounded: true, relativeTo: .title)
                    .foregroundStyle(FrolicColor.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("today.done.title")
                Text("Your first flower is in the garden.")
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 22)
            .padding(.top, 14)
            Button("See the garden") { router.tab = .garden }
                .buttonStyle(.frolicSecondaryWide)
                .padding(.horizontal, 16)
                .padding(.top, 18)
                .accessibilityIdentifier("today.done.garden")
            TodayMoneyCard(store: store)
                .padding(.horizontal, 16)
                .padding(.top, 16)
            TodayTomorrowRow(store: store)
        }
    }
}

private struct TodayNoPlanStart: View {
    var store: TodayStore
    @Environment(AppRouter.self) private var router
    @Environment(\.todayOnline) private var online

    var body: some View {
        if store.startingPlan || (store.frolic != nil && store.plan == nil) {
            VStack(spacing: 0) {
                TodayMeadow(people: store.freeFriends, waiting: true, buds: [store.mePerson])
                TodayCaption(text: "Finding something good…", identifier: "today.planning", showsDots: true)
                    .padding(.horizontal, 22)
                TodayPainting(name: "state-waiting", height: 170)
                    .padding(.top, 18)
            }
        } else if (store.today?.memberCount ?? 2) <= 1 {
            TodayStoryPage(
                hero: "plan-outdoors",
                people: [store.mePerson],
                ghosts: 3,
                caption: nil,
                kicker: store.today?.groupName ?? "Your crew",
                title: "It's just you so far",
                line: nil
            ) {
                TodayInviteButton(crewName: store.today?.groupName ?? "my crew")
            }
            .accessibilityIdentifier("state.empty")
        } else {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                TodayStoryPage(
                    hero: "plan-outdoors",
                    people: store.freeFriends,
                    caption: store.freeFriends.isEmpty ? nil : TodayCopy.names(store.freeFriends.map(\.name)) + (store.freeFriends.count == 1 ? " is free" : " are free"),
                    kicker: TodayCopy.weekday(context.date.timeIntervalSince1970 * 1000) + " · " + (store.today?.groupName ?? "Your crew"),
                    title: "No plan yet",
                    line: TodayCopy.dropCountdown(context.date)
                ) {
                    if let error = store.startError {
                        Text(error)
                            .todayFont(15, .semibold, relativeTo: .subheadline)
                            .foregroundStyle(StoryColor.ink)
                            .accessibilityIdentifier("today.imFree.error")
                    }
                    StoryPrimaryButton(title: "I'm free now", systemImage: "hand.wave.fill") { store.sheet = .imFree }
                        .disabled(!online)
                        .accessibilityIdentifier("today.imFree")
                }
            }
            .accessibilityIdentifier("state.empty")
        }
    }
}

struct TodayNoPlan: View {
    var title: String
    var message: String

    var body: some View {
        VStack(spacing: 14) {
            TodayPainting(name: "state-waiting", height: 190)
            Text(title)
                .todayFont(30, .heavy, rounded: true, relativeTo: .title)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .todayFont(17, relativeTo: .body)
                .foregroundStyle(FrolicColor.secondaryText)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 22)
        .padding(.top, 28)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.empty")
    }
}

private struct TodayErrorState: View {
    var message: String
    var retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            TodayPainting(name: "state-faded", height: 170)
            Text("Couldn't load today's plan")
                .todayFont(22, .heavy, rounded: true, relativeTo: .title2)
                .foregroundStyle(FrolicColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .todayFont(15, relativeTo: .subheadline)
                .foregroundStyle(FrolicColor.secondaryText)
            Button("Try again", action: retry)
                .buttonStyle(.frolicSecondaryWide)
                .padding(.top, 6)
                .accessibilityIdentifier("today.retry")
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 22)
        .padding(.top, 28)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("state.error")
    }
}

struct TodayPainting: View {
    var name: String
    var height: CGFloat

    var body: some View {
        if UIImage(named: name) != nil {
            Image(name)
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .accessibilityHidden(true)
        }
    }
}

private struct TodaySkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom) {
                ForEach(0..<4, id: \.self) { index in
                    VStack(spacing: 6) {
                        Circle().fill(FrolicColor.paper.opacity(0.7)).frame(width: 56, height: 56)
                        Capsule().fill(FrolicColor.stem.opacity(0.25)).frame(width: 4, height: [36, 14, 44, 24][index])
                    }
                    .scaleEffect(reduceMotion ? 1 : (pulse ? 1 : 0.86), anchor: .bottom)
                    .rotationEffect(.degrees(reduceMotion ? 0 : (pulse ? 2.5 : -2.5)), anchor: .bottom)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 1.1).repeatForever().delay(Double(index) * 0.22), value: pulse)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 128, alignment: .bottom)
            Capsule().fill(FrolicColor.paper.opacity(0.7)).frame(width: 220, height: 14).padding(.top, 12)
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(FrolicColor.paper.opacity(0.8))
                .frame(height: 300)
                .overlay(alignment: .top) {
                    FrolicColor.band.opacity(0.35).frame(height: 36)
                        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous))
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
            HStack(spacing: 10) {
                Capsule().fill(FrolicColor.ink.opacity(0.12)).frame(height: 54)
                Capsule().fill(FrolicColor.paper.opacity(0.8)).frame(width: 130, height: 54)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            HStack(spacing: 8) {
                SproutLoader()
                Text("Checking who's free")
                    .todayFont(13, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
            }
            .padding(.top, 14)
        }
        .opacity(reduceMotion ? 1 : (pulse ? 1 : 0.6))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(), value: pulse)
        .onAppear { pulse = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Checking who's free")
        .accessibilityIdentifier("state.loading")
    }
}
