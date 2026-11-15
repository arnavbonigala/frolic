import SwiftUI

@main
struct FrolicApp: App {
    @State private var router = AppRouter()
    @State private var connectivity = ConnectivityMonitor()
    @State private var backend = FrolicBackend.shared
    @State private var identity = FrolicIdentity.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .environment(connectivity)
                .environment(backend)
                .environment(identity)
                .onOpenURL { router.handle($0) }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { identity.refresh() }
                }
        }
    }
}
