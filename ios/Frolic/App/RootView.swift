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
            Tab(value: AppTab.today) {
                TodayScreen()
            } label: {
                Label(AppTab.today.title, systemImage: AppTab.today.systemImage)
                    .accessibilityIdentifier("tab.today")
            }
            Tab(value: AppTab.crew) {
                CrewScreen()
            } label: {
                Label(AppTab.crew.title, systemImage: AppTab.crew.systemImage)
                    .accessibilityIdentifier("tab.crew")
            }
            Tab(value: AppTab.garden) {
                GardenScreen()
            } label: {
                Label(AppTab.garden.title, systemImage: AppTab.garden.systemImage)
                    .accessibilityIdentifier("tab.garden")
            }
            Tab(value: AppTab.you) {
                YouScreen()
            } label: {
                Label {
                    Text(AppTab.you.title)
                } icon: {
                    if let avatar = MyAvatar.shared.image {
                        Image(uiImage: avatar)
                    } else {
                        Image(systemName: AppTab.you.systemImage)
                    }
                }
                .accessibilityIdentifier("tab.you")
            }
        }
        .tint(Color(hex: 0x2E8A4E))
        .accessibilityIdentifier("app.root")
        .checkInFlowPresenter()
        #if DEBUG || E2E
        .sheet(isPresented: $router.showsGallery) {
            ComponentGallery()
        }
        #endif
    }
}
