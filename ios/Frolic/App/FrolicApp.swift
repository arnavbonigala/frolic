import SwiftUI

@main
struct FrolicApp: App {
    @UIApplicationDelegateAdaptor(LockScreenAppDelegate.self) private var lockScreen
    @State private var router = AppRouter()
    @State private var connectivity = ConnectivityMonitor()
    @State private var backend = FrolicBackend.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .environment(connectivity)
                .environment(backend)
                .onOpenURL { url in
                    router.handle(url)
                    lockScreen.handle(url)
                }
        }
    }
}
