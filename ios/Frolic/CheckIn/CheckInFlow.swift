import SwiftUI
import UIKit

@MainActor
@Observable
final class CheckInFlowCoordinator {
    static let shared = CheckInFlowCoordinator()

    var frolicId: String?
    var isPresented = false

    func open(frolicId: String? = nil) {
        self.frolicId = frolicId
        isPresented = true
    }

    func close() {
        isPresented = false
    }
}

struct CheckInFlowScreen: View {
    var frolicId: String?
    var onClose: () -> Void
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var store: CheckInStore?
    @State private var watcher = ArrivalWatcher()
    @State private var snapModel = GroupSnapModel()
    @State private var showsBail = false
    @State private var autoSnap = false
    @State private var seededSnap: String?

    private var shown: ScreenPhase {
        guard let store else { return .loading }
        return router.resolve(store.phase, isOnline: connectivity.isOnline)
    }

    var body: some View {
        Group {
            if let store {
                switch store.step {
                case .onTheWay:
                    OnTheWayScreen(
                        store: store,
                        watcher: watcher,
                        shown: shown,
                        onBack: onClose,
                        onBail: { showsBail = true }
                    )
                case .snap:
                    GroupSnapScreen(
                        store: store,
                        model: snapModel,
                        shown: shown,
                        autoSnap: autoSnap,
                        onBack: {
                            store.step = .onTheWay
                            snapModel.cancel()
                        },
                        onSkip: onClose
                    )
                case .collage:
                    SnapCollage(
                        store: store,
                        frolicId: frolicId ?? "",
                        onPlant: onClose,
                        onAgain: {
                            store.step = .snap
                            snapModel.stage = .ready
                        }
                    )
                }
            } else {
                PhasePlaceholder(
                    phase: .loading,
                    copy: PlaceholderCopy(
                        loading: "Finding everyone",
                        emptyTitle: "No plan to walk to",
                        emptyMessage: "Today's frolic opens here when it's on.",
                        errorTitle: "Couldn't open the frolic"
                    ),
                    color: .marigold
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(SkyBackground())
            }
        }
        .sheet(isPresented: $showsBail) {
            BailSheet(
                names: store?.otherNames ?? "",
                onKeepGoing: { showsBail = false },
                onSitOut: {
                    showsBail = false
                    Task {
                        if await store?.bail() == true { onClose() }
                    }
                }
            )
            .presentationDetents([.height(250)])
            .presentationDragIndicator(.hidden)
            .presentationBackground(FrolicColor.cream)
        }
        .task { await prepare() }
        .onDisappear {
            store?.stop()
            snapModel.cancel()
        }
    }

    private func prepare() async {
        guard store == nil else { return }
        let route = router.e2eRoute
        let resolved = frolicId ?? (route?.argument?.isEmpty == false ? route?.argument : nil)
        let created = CheckInStore(frolicId: resolved)
        created.attach(watcher: watcher)
        store = created
        seedE2E(route, store: created)
        await created.load(backend: backend)
        if let place = created.place {
            watcher.begin(place: place, simulation: router.simulatedLocation)
        }
        if seededSnap == "count" {
            autoSnap = true
        } else if seededSnap == "done" {
            created.myShot = UIImage(named: "hills_sunset")
            created.step = .collage
        }
    }

    private func seedE2E(_ route: E2ERoute?, store: CheckInStore) {
        guard let route else { return }
        if route.screen == "checkin" {
            store.step = .snap
        }
        seededSnap = route.query["snap"]
        if route.query["camera"] == "denied" {
            snapModel.camera.mode = .denied
        }
        switch route.query["money"] {
        case "returned"?: store.money = WireMoney(state: "returned", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        case "returning"?: store.money = WireMoney(state: "returning", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        default: break
        }
        if route.screen == "otw", route.query["arrived"] == "1" {
            watcher.arrived = true
        }
    }
}

struct CheckInFlowPresenter: ViewModifier {
    @Environment(AppRouter.self) private var router
    @State private var coordinator = CheckInFlowCoordinator.shared
    @State private var presented = false
    @State private var e2eFrolicId: String?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $presented, onDismiss: { coordinator.close() }) {
                CheckInFlowScreen(frolicId: coordinator.frolicId ?? e2eFrolicId) {
                    presented = false
                }
            }
            .onAppear { sync() }
            .onChange(of: coordinator.isPresented) { _, value in
                if value { presented = true }
            }
            .onChange(of: router.e2eRoute) { _, _ in sync() }
    }

    private func sync() {
        guard let route = router.e2eRoute, route.screen == "otw" || route.screen == "checkin" else { return }
        e2eFrolicId = route.argument
        presented = true
    }
}

extension View {
    func checkInFlowPresenter() -> some View {
        modifier(CheckInFlowPresenter())
    }
}
