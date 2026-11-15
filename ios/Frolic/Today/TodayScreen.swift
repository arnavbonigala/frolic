import SwiftUI

struct TodayScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @Environment(FrolicIdentity.self) private var identity
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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

    var body: some View {
        @Bindable var store = store
        ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 0) {
                    TodayTopBar(store: store, ready: shown == .ready)
                    content
                }
                .padding(.bottom, 32)
            }
            .scrollBounceBehavior(.basedOnSize)
            if !connectivity.isOnline && store.today != nil && router.phaseOverride == nil {
                TodayOfflineBanner()
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            TodayBloomOverlay(trigger: store.bloomID)
                .allowsHitTesting(false)
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
        .background(SkyBackground())
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

    var body: some View {
        HStack {
            Wordmark()
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
        .padding(.horizontal, 18)
        .padding(.top, 8)
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
        Group {
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

    var body: some View {
        let plan = store.plan
        let title = plan?.title ?? ""
        TodayPacket(
            label: label ?? "TODAY · " + TodayCopy.weekday(plan?.startsAt ?? store.now()),
            number: number ?? store.today?.frolicNumber.map { "Crew frolic No. \(Int($0))" } ?? store.today?.groupName,
            hero: TodayCopy.heroAsset(plan),
            heroURL: plan?.place?.photoUrl,
            heroDescription: title,
            showsWhy: showsWhy,
            why: plan?.why
        ) {
            Text(title)
                .todayFont(title.count > 20 ? 25 : 30, .heavy, rounded: true, relativeTo: .title)
                .tracking(-0.3)
                .foregroundStyle(FrolicColor.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let line = plan?.line, !line.isEmpty {
                Text(line)
                    .todayFont(15, relativeTo: .subheadline)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("today.plan.line")
            }
            ChipRow(chips: TodayCopy.chips(plan: plan, walk: store.walkMinutes))
            if let hostedBy = hostedBy ?? store.drop?.hostedBy {
                Text(hostedBy.hasPrefix("Hosted by") ? hostedBy : "Hosted by \(hostedBy)")
                    .todayFont(13, .semibold, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.chipText)
                    .accessibilityIdentifier("today.plan.hostedBy")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }
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

    var body: some View {
        let free = store.freeFriends
        VStack(spacing: 0) {
            TodayMeadow(people: free, waiting: false) { router.tab = .crew }
                .accessibilityIdentifier("today.meadow")
            TodayCaption(text: free.isEmpty ? "Nobody's free yet. Your yes still counts." : TodayCopy.names(free.map(\.name)) + (free.count == 1 ? " is free" : " are free"), identifier: "today.freeRow")
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
            TodayPlanPacket(store: store)
            HStack(spacing: 10) {
                Button("I'm down") {
                    store.seeHint()
                    store.tapDown(onlyIf: [])
                }
                    .buttonStyle(.frolicPrimary)
                    .accessibilityIdentifier("today.down")
                Button("Only with…") {
                    store.picks = []
                    store.sheet = .onlyIf
                }
                .buttonStyle(.frolicSecondary)
                .accessibilityIdentifier("today.onlyIf")
            }
            .disabled(!online)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            if store.hintSeen {
                TodayHush(text: "Nobody sees you're down unless they are too", identifier: "today.hush")
            } else {
                Text("Only friends who are also down will ever see this.")
                    .todayFont(13, .semibold, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.chipText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(FrolicColor.chip))
                    .padding(.top, 8)
                    .accessibilityIdentifier("today.hint")
            }
            TodayTomorrowRow(store: store)
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
            TodayMeadow(people: store.freeFriends, waiting: true, buds: [store.mePerson]) { router.tab = .crew }
                .accessibilityIdentifier("today.meadow")
            TodayCaption(text: "Waiting for a friend", identifier: "today.caption.waiting", showsDots: true)
            TodayPlanPacket(store: store, showsWhy: false)
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
                text: waiting ? "Waiting for a friend" : "Your crew grows from here. Today's plan is still yours.",
                identifier: waiting ? "today.caption.waiting" : "today.freeRow",
                showsDots: waiting
            )
            .padding(.horizontal, 22)
            TodayPlanPacket(store: store, label: "TODAY · JUST FOR YOU", number: "Your first frolic", showsWhy: !waiting)
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
                Text("Nobody gets told.")
                    .todayFont(17, relativeTo: .body)
                    .foregroundStyle(FrolicColor.secondaryText)
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
                    animatesIn: animatesIn
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
    @State private var heldPrompted: String?

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
        .task(id: store.visiblePayment?.state) {
            guard let payment = store.visiblePayment, payment.state == "due", payment.kind == "hold",
                  let frolicId = store.frolic?.frolicId, heldPrompted != frolicId, store.bloomID > 0 || store.isFixture
            else { return }
            heldPrompted = frolicId
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if store.bloomed, store.sheet == nil, store.visiblePayment?.state == "due" { store.sheet = .hold }
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
                Text("This one drifted off. Nobody knows you said yes.")
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
                Text("Your crew sees a plan, not who started it.")
                    .todayFont(13, relativeTo: .footnote)
                    .foregroundStyle(FrolicColor.secondaryText)
                    .padding(.top, 10)
            }
        } else {
            VStack(spacing: 0) {
                TimelineView(.periodic(from: .now, by: 30)) { context in
                    TodayNoPlan(title: "No plan yet", message: TodayCopy.dropCountdown(context.date))
                }
                if let line = store.gardenHealth?.line, !line.isEmpty {
                    Text(line)
                        .todayFont(15, .semibold, relativeTo: .subheadline)
                        .foregroundStyle(FrolicColor.ink)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 22)
                        .padding(.top, 10)
                        .accessibilityIdentifier("today.garden.health")
                }
                if let error = store.startError {
                    TodayStatusCard(title: error, message: "Nobody was told.")
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .accessibilityIdentifier("today.imFree.error")
                }
                Button("I'm free") { store.sheet = .imFree }
                    .buttonStyle(.frolicPrimary)
                    .disabled(!online)
                    .padding(.horizontal, 16)
                    .padding(.top, 18)
                    .accessibilityIdentifier("today.imFree")
                if let past = store.onThisDay, let title = past.title {
                    TodayRowLink(
                        thumb: past.heroKey.flatMap { UIImage(named: $0) != nil ? $0 : nil } ?? "plan-free-stuff",
                        thumbRemote: past.photoUrl,
                        prefix: (past.label ?? "On this day") + ":",
                        text: title,
                        identifier: "today.onThisDay",
                        action: { router.tab = .garden }
                    )
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                }
                TodayTomorrowRow(store: store)
            }
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
                ProgressView().tint(FrolicColor.secondaryText)
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
