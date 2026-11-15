import SwiftUI
import UIKit

struct CrewScreen: View {
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var store = CrewStore()
    @State private var inviteLink: String?
    @State private var copied = false

    private var shown: ScreenPhase { router.resolve(store.phase, isOnline: connectivity.isOnline) }

    var body: some View {
        @Bindable var store = store
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ScreenTitle(
                    title: store.view?.groupName ?? "Crew",
                    subtitle: store.view?.subtitle,
                    identifier: "crew"
                )
                if let view = store.view, shown == .ready {
                    CrewFreeControl(text: view.me.detail, isFree: view.me.isFree) {
                        store.showsFreeSheet = true
                    }
                    .padding(.top, 14)
                }
                PhasedContent(
                    phase: shown,
                    copy: PlaceholderCopy(
                        loading: "Finding your crew",
                        emptyTitle: "Your crew starts with one friend",
                        emptyMessage: "Send a link to the group chat. Anyone who taps I'm down joins your crew.",
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
            .padding(.top, 24)
            .padding(.bottom, 120)
        }
        .background(SkyBackground())
        .accessibilityIdentifier("crew.screen")
        .accessibilityElement(children: .contain)
        .task {
            store.start(router: router, backend: backend)
            applyRoute()
        }
        .onChange(of: router.e2eRoute) { _, _ in
            store.routeChanged(router: router, backend: backend)
            applyRoute()
        }
        .sheet(isPresented: $store.showsFreeSheet) {
            CrewFreeSheet(
                current: store.view?.me.detail ?? "",
                error: store.actionError,
                onPick: { option in
                    Task { await store.setFree(option) }
                },
                onDone: { store.showsFreeSheet = false }
            )
            .presentationDetents([.medium, .large])
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
            .presentationCornerRadius(38)
            .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $store.showsInvite) {
            CrewInviteSheet(
                link: inviteLink,
                onCopy: {
                    UIPasteboard.general.string = "https://\(inviteLink ?? "frolic.app")"
                    copied = true
                },
                copied: copied
            )
            .presentationDetents([.medium, .large])
            .presentationCornerRadius(38)
            .presentationDragIndicator(.hidden)
            .task {
                copied = false
                if store.isStandIn {
                    inviteLink = "frolic.app/j/sunset-crew"
                } else if let code = await store.inviteCode() {
                    inviteLink = "frolic.app/j/\(code)"
                }
            }
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
    var view: CrewView
    var store: CrewStore
    var onComingUp: () -> Void

    var body: some View {
        SectionHeader(title: "Today")
        FrolicGroup {
            CrewPersonRowView(row: view.me, showsDivider: false, onTap: nil)
            ForEach(view.rows) { row in
                CrewPersonRowView(row: row, showsDivider: true, onTap: { store.friend = row })
            }
        }
        if view.nobodyFree {
            Text("Nobody's free yet today. When someone says yes, their flower blooms here.")
                .frolicFont(.footnote)
                .foregroundStyle(FrolicColor.secondaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .accessibilityIdentifier("crew.nobodyFree")
        }
        Text("Distances are rough on purpose. Nobody sees exactly where you are.")
            .frolicFont(.footnote)
            .foregroundStyle(FrolicColor.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .accessibilityIdentifier("crew.distance.note")

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

        SectionHeader(title: "Frolic Fund")
        CrewFundSection(fund: view.fund)
            .padding(.top, 2)

        if !view.lately.isEmpty {
            SectionHeader(title: "Lately")
            CrewLatelyGroup(rows: view.lately)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("crew.lately")
        }

        if view.wentToday, let title = view.todayTitle {
            SectionHeader(title: "New this week")
            CrewNewThisWeek(title: title, hero: PlanPainted.hero(for: title))
        }

        if !view.favorites.isEmpty {
            SectionHeader(title: "Your crew's favorites")
            CrewFavoritesGroup(rows: view.favorites)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("crew.favorites")
        }
    }
}
