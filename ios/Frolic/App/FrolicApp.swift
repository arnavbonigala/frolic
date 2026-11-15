import SwiftUI

@main
struct FrolicApp: App {
    @State private var router = AppRouter()
    @State private var connectivity = ConnectivityMonitor()
    @State private var backend = FrolicBackend.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(router)
                .environment(connectivity)
                .environment(backend)
                .onOpenURL { router.handle($0) }
        }
    }
}
