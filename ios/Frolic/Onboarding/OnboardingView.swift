import SwiftUI

struct OnboardingView: View {
    @Bindable var model: OnboardingModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch model.step {
            case .join: JoinScreen(model: model)
            case .name: NameScreen(model: model)
            case .share: ShareScreen(model: model)
            case .taste: TasteScreen(model: model)
            case .reading: ReadingScreen(model: model)
            case .calendar: CalendarScreen(model: model)
            }
        }
        .transition(.opacity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.3), value: model.step)
        .task(id: ObjectIdentifier(model)) { model.start() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("onboarding.screen")
    }
}

@MainActor
struct OnboardingGate<Content: View>: View {
    @Environment(AppRouter.self) private var router
    @Environment(FrolicBackend.self) private var backend
    @Environment(FrolicIdentity.self) private var identity
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: OnboardingModel?
    @State private var finished = OnboardingIdentity.isComplete
    @State private var adding: InviteLink?
    @ViewBuilder var content: Content

    var body: some View {
        Group {
            if showsContent {
                content
            } else if let model {
                OnboardingView(model: model)
            } else {
                SkyBackground().ignoresSafeArea()
            }
        }
        .onChange(of: router.e2eRoute) { _, _ in rebuild() }
        .onChange(of: identity.groupId) { _, group in
            if group != nil, !(model?.isMidFlow ?? false) { finished = true }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, !showsContent, router.e2eRoute == nil else { return }
            Task { await adoptMembership() }
        }
        .onChange(of: model?.invitePhase) { _, phase in
            guard phase == .expired || phase == .invalid, !showsContent, router.e2eRoute == nil else { return }
            Task { await adoptMembership() }
        }
        .onOpenURL { url in
            guard url.scheme == "frolic", url.host == "join", let link = InviteLink(url: url) else { return }
            if identity.groupId != nil, OnboardingIdentity.isComplete {
                adding = link
                return
            }
            OnboardingIdentity.reset()
            finished = false
            model = makeModel(seed: nil, link: link)
        }
        .fullScreenCover(isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } })) {
            AddCrewFlow(link: adding, onClose: { adding = nil })
        }
        .task {
            if model == nil { rebuild() }
            guard !showsContent, router.e2eRoute == nil else { return }
            await adoptMembership()
        }
    }

    private var showsContent: Bool {
        (finished || identity.groupId != nil) && !forcesOnboarding && !(model?.isMidFlow ?? false)
    }

    private func adoptMembership() async {
        guard !holdsInvite else { return }
        guard let group = await OnboardingBackend(client: backend.client).existingMembership() else { return }
        guard !holdsInvite, !showsContent else { return }
        OnboardingIdentity.commit(groupId: group)
        finished = true
    }

    private var holdsInvite: Bool {
        if InviteLink.launchOverride != nil, model?.link == nil { return true }
        guard let model else { return false }
        if model.createdInviteCode != nil || model.isMidFlow { return true }
        guard model.link != nil else { return false }
        return model.invitePhase != .expired && model.invitePhase != .invalid
    }

    private var forcesOnboarding: Bool {
        #if DEBUG || E2E
        guard let route = router.e2eRoute else { return false }
        return ["join", "name", "share", "taste", "reading", "calendar"].contains(route.screen)
        #else
        return false
        #endif
    }

    private func rebuild() {
        #if DEBUG || E2E
        if let route = router.e2eRoute, ["join", "name", "share", "taste", "reading", "calendar"].contains(route.screen) {
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
