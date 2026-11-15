import SwiftUI

struct RootView: View {
    @Environment(AppRouter.self) private var router

    var body: some View {
        OnboardingGate {
            tabs
        }
    }

    private var tabs: some View {
        @Bindable var router = router
        return TabView(selection: $router.tab) {
            Tab(AppTab.today.title, systemImage: AppTab.today.systemImage, value: AppTab.today) {
                TodayScreen()
            }
            Tab(AppTab.crew.title, systemImage: AppTab.crew.systemImage, value: AppTab.crew) {
                CrewScreen()
            }
            Tab(AppTab.garden.title, systemImage: AppTab.garden.systemImage, value: AppTab.garden) {
                GardenScreen()
            }
            Tab(AppTab.you.title, systemImage: AppTab.you.systemImage, value: AppTab.you) {
                YouScreen()
            }
        }
        .tint(FrolicColor.ink)
        .accessibilityIdentifier("app.root")
        #if DEBUG || E2E
        .sheet(isPresented: $router.showsGallery) {
            ComponentGallery()
        }
        #endif
    }
}
