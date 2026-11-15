import SwiftUI

@MainActor
final class AppPrefetch {
    static let shared = AppPrefetch()
    let crew = CrewStore()
    let garden = GardenStore()
    let you = YouModel()

    func start(router: AppRouter, backend: FrolicBackend) async {
        crew.start(router: router, backend: backend)
        garden.start(backend: backend, route: router.e2eRoute)
        await you.run(backend: backend, router: router)
    }
}
