import SwiftUI
import UIKit

struct CrewScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var store = AppPrefetch.shared.crew
    @State private var inviteLink: String?
    @State private var inviteHeight: CGFloat = 260
    @State private var copied = false

    private var shown: ScreenPhase { router.resolve(store.phase, isOnline: connectivity.isOnline) }

    var body: some View {
        @Bindable var store = store
        return ScrollView {
            VStack(spacing: 0) {
            StoryHero(asset: store.view?.todayTitle.flatMap(PlanPainted.hero(for:)) ?? "plan-games", height: 290) {
                if let view = store.view {
                    VStack(spacing: 10) {
                        HStack(alignment: .bottom, spacing: 0) {
                            ForEach(Array(([view.me] + view.friendRows).prefix(6).enumerated()), id: \.offset) { index, row in
                                CrewBloom(row: row, radius: 24, stem: [30, 46, 36, 52, 40, 34][index % 6])
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .padding(.horizontal, 24)
                        .accessibilityHidden(true)
                        let free = ([view.me] + view.friendRows).filter(\.isFree).count
                        StoryCaption(text: free == 0 ? "Nobody's free yet" : "\(free) of \(view.friendRows.count + 1) free today")
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                CrewSwitcherTitle(
                    title: store.view?.groupName ?? "Crew",
                    subtitle: store.view?.subtitle,
                    centered: true
                )
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Finding your crew",
                        emptyTitle: "Your crew starts with one friend",
                        emptyMessage: "Anyone who taps joins your crew.",
                        emptyAction: "Invite a friend",
                        errorTitle: "Couldn't load your crew"
                    ),
                    color: .cobalt,
                    onEmptyAction: { store.showsInvite = true },
                    onRetry: { store.retry(backend: backend, router: router) }
                ) {
                    if let view = store.view {
                        CrewContent(view: view, store: store, onComingUp: { router.tab = .today })
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 2)
            .padding(.bottom, 120)
            }
        }
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .top)
        .background(SkyBackground())
        .accessibilityIdentifier("crew.screen")
        .accessibilityElement(children: .contain)
        .task {
            store.start(router: router, backend: backend)
            applyRoute()
        }
        .onChange(of: FrolicIdentity.shared.groupId) { _, _ in store.retry(backend: backend, router: router) }
        .onChange(of: FrolicIdentity.shared.deviceToken) { _, _ in store.retry(backend: backend, router: router) }
        .onChange(of: router.e2eRoute) { _, _ in
            store.routeChanged(router: router, backend: backend)
            applyRoute()
        }
        .sheet(isPresented: $store.showsFreeSheet) {
            CrewFreeSheet(
                current: store.view?.me.detail ?? "",
                isBusy: store.view?.me.status == .busy,
                options: CrewFreeOption.options(),
                error: store.actionError,
                onPick: { option in
                    Task { await store.setFree(option) }
                },
                onDone: { store.showsFreeSheet = false }
            )
            .presentationDetents([.medium, .large])
            .presentationBackground(FrolicColor.cream)
            .presentationCornerRadius(38)
            .presentationDragIndicator(.hidden)
        }
        .sheet(item: $store.friend) { row in
            CrewFriendSheet(
                row: row,
                wentTogether: row.status == .wentWithYou,
                place: store.view?.todayTitle
            )
            .presentationDetents([.medium, .large])
            .presentationBackground(FrolicColor.cream)
            .presentationCornerRadius(38)
            .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $store.showsInvite) {
            CrewInviteSheet(
                link: inviteLink,
                error: store.inviteError,
                onRetry: { Task { await loadInvite() } },
                onCopy: {
                    UIPasteboard.general.string = inviteLink
                    copied = true
                },
                copied: copied
            )
            .fixedSize(horizontal: false, vertical: true)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { inviteHeight = $0 }
            .presentationDetents([.height(max(inviteHeight, 200))])
            .presentationBackground(FrolicColor.cream)
            .presentationCornerRadius(38)
            .presentationDragIndicator(.hidden)
            .task {
                copied = false
                await loadInvite()
            }
        }
    }

    private func loadInvite() async {
        if store.isStandIn {
            inviteLink = "https://frolic.app/p/sunset-crew"
        } else if let code = await store.inviteCode() {
            inviteLink = store.inviteURL(code: code)
        }
    }

    private func applyRoute() {
        guard let route = router.e2eRoute, route.screen == "crew" else { return }
        if let friend = CrewStandIn.friend(route: route) {
            store.friend = friend
        }
        if route.state == "invite" {
            store.showsInvite = true
        }
        if route.state == "free" {
            store.showsFreeSheet = true
        }
    }
}

private struct CrewContent: View {
    var view: CrewScene
    var store: CrewStore
    var onComingUp: () -> Void

    var body: some View {
        SectionHeader(title: "Today")
        FrolicGroup {
            CrewPersonRowView(row: view.me, showsDivider: false, onTap: { store.showsFreeSheet = true })
                .staggeredArrival(0)
            ForEach(Array(view.rows.enumerated()), id: \.element.id) { index, row in
                CrewPersonRowView(row: row, showsDivider: true, onTap: { store.friend = row })
                    .staggeredArrival(index + 1)
            }
        }

        DailyPickCard(me: TodayPerson(userId: view.me.id, name: view.me.name, color: view.me.color.rawValue, photoUrl: view.me.photoURL, role: nil))
            .padding(.top, 28)

        if let comingUp = view.comingUp {
            SectionHeader(title: "Coming up")
            CrewComingUpRow(comingUp: comingUp, onTap: onComingUp)
        }

        Button {
            store.showsInvite = true
        } label: {
            Label("Invite a friend", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(.frolicSecondaryWide)
        .padding(.top, 18)
        .accessibilityIdentifier("crew.invite")

        if view.showsHold {
            CrewHoldRow(groupName: view.groupName, isOn: view.holdEnabled, amount: CrewCopy.money(view.holdCents)) { enabled in
                Task { await store.setHold(enabled) }
            }
            .padding(.top, 14)
        }
        if view.showsFund {
            SectionHeader(title: "Frolic Fund")
            CrewFundSection(fund: view.fund)
                .padding(.top, 2)
        }

    }
}
