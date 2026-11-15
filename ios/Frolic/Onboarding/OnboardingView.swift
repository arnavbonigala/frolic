import SwiftUI

struct OnboardingView: View {
    @Bindable var model: OnboardingModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch model.step {
            case .join: JoinScreen(model: model)
            case .name: NameScreen(model: model)
            case .taste: TasteScreen(model: model)
            case .reading: ReadingScreen(model: model)
            case .calendar: CalendarScreen(model: model)
            }
        }
        .transition(.opacity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: model.step)
        .task { model.start() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("onboarding.screen")
    }
}

struct OnboardingGate<Content: View>: View {
    @Environment(AppRouter.self) private var router
    @Environment(FrolicBackend.self) private var backend
    @State private var model: OnboardingModel?
    @State private var finished = OnboardingIdentity.isComplete
    @ViewBuilder var content: Content

    var body: some View {
        Group {
            if finished && !forcesOnboarding {
                content
            } else if let model {
                OnboardingView(model: model)
            } else {
                SkyBackground().ignoresSafeArea()
            }
        }
        .onChange(of: router.e2eRoute) { _, _ in rebuild() }
        .onOpenURL { url in
            guard url.scheme == "frolic", url.host == "join", let link = InviteLink(url: url) else { return }
            OnboardingIdentity.reset()
            finished = false
            model = makeModel(seed: nil, link: link)
        }
        .task { if model == nil { rebuild() } }
    }

    private var forcesOnboarding: Bool {
        #if DEBUG || E2E
        guard let route = router.e2eRoute else { return false }
        return ["join", "name", "taste", "reading", "calendar"].contains(route.screen)
        #else
        return false
        #endif
    }

    private func rebuild() {
        #if DEBUG || E2E
        if let route = router.e2eRoute, ["join", "name", "taste", "reading", "calendar"].contains(route.screen) {
            model = makeModel(seed: .init(screen: route.screen, state: route.state, query: route.query), link: nil)
            return
        }
        #endif
        if !finished { model = makeModel(seed: nil, link: nil) }
    }

    private func makeModel(seed: OnboardingModel.Seed?, link: InviteLink?) -> OnboardingModel {
        let created = OnboardingModel(backend: OnboardingBackend(client: backend.client), seed: seed)
        if let link { created.link = link }
        created.onFinish = { finished = true }
        return created
    }
}
