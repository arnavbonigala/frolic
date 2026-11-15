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
}

struct CheckInFlowScreen: View {
    var frolicId: String?
    var onClose: () -> Void
    @Environment(AppRouter.self) private var router
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(FrolicBackend.self) private var backend
    @State private var store: CheckInStore
    @State private var watcher = ArrivalWatcher()
    @State private var snapModel = GroupSnapModel()
    @State private var showsBail = false
    @State private var autoSnap = false
    @State private var prepared = false

    init(frolicId: String?, onClose: @escaping () -> Void) {
        self.frolicId = frolicId
        self.onClose = onClose
        _store = State(initialValue: CheckInStore(frolicId: frolicId))
    }

    private var shown: ScreenPhase {
        router.resolve(store.phase, isOnline: connectivity.isOnline)
    }

    var body: some View {
        Group {
            switch store.step {
            case .onTheWay:
                OnTheWayScreen(store: store, watcher: watcher, shown: shown, onBack: onClose, onRetry: retry, onBail: { showsBail = true })
            case .snap:
                GroupSnapScreen(
                    store: store,
                    model: snapModel,
                    shown: shown,
                    autoSnap: autoSnap,
                    onBack: {
                        snapModel.cancel()
                        store.step = .onTheWay
                    },
                    onSkip: onClose,
                    onSnapped: { store.noteSnapTaken($0) }
                )
            case .collage:
                SnapCollage(store: store, onPlant: onClose, onAgain: {
                    snapModel.reset()
                    store.step = .snap
                })
            }
        }
        .animation(.easeInOut(duration: 0.3), value: store.step)
        .sheet(isPresented: $showsBail) {
            BailSheet(
                onKeepGoing: { showsBail = false },
                onSitOut: {
                    showsBail = false
                    Task {
                        if await store.bail() { onClose() }
                    }
                }
            )
            .presentationDetents([.fraction(0.34), .large])
            .presentationCornerRadius(38)
            .presentationBackground(Color(hex: 0xFFFCF7, opacity: 0.96))
        }
        .onChange(of: store.place) { _, place in
            watcher.begin(place: place, simulation: router.simulatedLocation)
        }
        .onChange(of: router.simulatedLocation) { _, location in
            watcher.begin(place: store.place, simulation: location)
            Task { await store.refreshRoute() }
        }
        .onChange(of: watcher.arrived) { _, arrived in
            guard arrived, store.phase == .ready, !store.checkedIn else { return }
            store.checkIn(method: "geofence")
        }
        .onChange(of: watcher.currentCoordinate?.latitude) { _, _ in
            Task { await store.refreshRoute() }
        }
        .task { await prepare() }
        .onDisappear {
            store.stop()
            watcher.stop()
            snapModel.cancel()
            snapModel.camera.stop()
        }
    }

    private func retry() {
        Task { await store.load(backend: backend) }
    }

    private func prepare() async {
        guard !prepared else { return }
        prepared = true
        store.attach(watcher: watcher)
        if let route = router.e2eRoute {
            seed(route)
        }
        await store.load(backend: backend)
    }

    private func seed(_ route: E2ERoute) {
        if route.screen == "checkin" { store.step = .snap }
        switch route.query["snap"] {
        case "count"?: autoSnap = true
        default: break
        }
        if route.query["camera"] == "denied" { snapModel.camera.mode = .denied }
        if let state = route.query["money"], ["returned", "returning"].contains(state) {
            store.money = WireMoney(state: state, kind: "hold", amountCents: 300, error: nil, paidNames: [])
        }
    }
}

struct CheckInFlowPresenter: ViewModifier {
    @Environment(AppRouter.self) private var router
    @State private var coordinator = CheckInFlowCoordinator.shared

    func body(content: Content) -> some View {
        @Bindable var coordinator = coordinator
        content
            .fullScreenCover(isPresented: $coordinator.isPresented) {
                CheckInFlowScreen(frolicId: coordinator.frolicId) {
                    coordinator.isPresented = false
                }
            }
            .onAppear { sync(router.e2eRoute) }
            .onChange(of: router.e2eRoute) { _, route in sync(route) }
    }

    private func sync(_ route: E2ERoute?) {
        guard let route, route.screen == "otw" || route.screen == "checkin" else { return }
        if !coordinator.isPresented { coordinator.open(frolicId: route.argument) }
    }
}

extension View {
    func checkInFlowPresenter() -> some View {
        modifier(CheckInFlowPresenter())
    }
}
