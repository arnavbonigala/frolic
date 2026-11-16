import SwiftUI

@main
struct FrolicApp: App {
    @UIApplicationDelegateAdaptor(LockScreenAppDelegate.self) private var lockScreen
    @State private var router = AppRouter()
    @State private var connectivity = ConnectivityMonitor()
    @State private var backend = FrolicBackend.shared
    @State private var identity = FrolicIdentity.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var opening = true

    var body: some Scene {
        WindowGroup {
            RootView()
                #if DEBUG || E2E
                .preferredColorScheme(ProcessInfo.processInfo.environment["FROLIC_FORCE_DARK"] == "1" ? .dark : nil)
                #endif
                .environment(router)
                .environment(connectivity)
                .environment(backend)
                .environment(identity)
                .onOpenURL { url in
                    router.handle(url)
                    lockScreen.handle(url)
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { identity.refresh() }
                }
                .overlay {
                    if opening {
                        LaunchBloom { opening = false }
                    }
                }
        }
    }
}
