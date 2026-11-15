import Combine
import ConvexMobile
import Foundation
import Observation

@MainActor
@Observable
final class GardenStore {
    private(set) var overview: GardenOverview?
    private(set) var phase: ScreenPhase = .loading
    private(set) var memory: GardenMemory?
    private(set) var memoryPhase: ScreenPhase = .loading

    @ObservationIgnored private var overviewTask: Task<Void, Never>?
    @ObservationIgnored private var memoryTask: Task<Void, Never>?
    @ObservationIgnored private var loadedMemory: String?

    func start(backend: FrolicBackend, route: E2ERoute?) {
        overviewTask?.cancel()
        #if DEBUG || E2E
        if let seeded = GardenFixtures.overview(route: route) {
            overview = seeded
            phase = seeded.isEmpty ? .empty : .ready
            return
        }
        #endif
        guard backend.isConfigured, let client = backend.client else {
            phase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        guard let identity = GardenIdentity.resolve(route: route) else {
            phase = .empty
            return
        }
        phase = .loading
        let args: [String: ConvexEncodable?] = ["deviceToken": identity.deviceToken, "groupId": identity.groupId]
        overviewTask = Task { [weak self] in
            do {
                for try await value in client.subscribe(to: "garden:overview", with: args, yielding: GardenOverview?.self).values {
                    guard !Task.isCancelled, let self else { return }
                    guard let value else { continue }
                    overview = value
                    phase = value.isEmpty ? .empty : .ready
                }
            } catch {
                guard !Task.isCancelled, let self else { return }
                if overview == nil {
                    phase = .error(GardenStore.message(for: error))
                }
            }
        }
    }

    func loadMemory(_ row: GardenMemoryRow, backend: FrolicBackend, route: E2ERoute?) {
        if loadedMemory == row.frolicId, memoryPhase == .ready, memory != nil { return }
        memoryTask?.cancel()
        loadedMemory = row.frolicId
        #if DEBUG || E2E
        if let seeded = GardenFixtures.memory(row: row, route: route) {
            memory = seeded
            memoryPhase = .ready
            return
        }
        #endif
        guard backend.isConfigured, let client = backend.client else {
            memoryPhase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        guard let identity = GardenIdentity.resolve(route: route) else {
            memoryPhase = .error("Check your connection and try again.")
            return
        }
        memory = nil
        memoryPhase = .loading
        let args: [String: ConvexEncodable?] = ["deviceToken": identity.deviceToken, "frolicId": row.frolicId]
        memoryTask = Task { [weak self] in
            do {
                for try await value in client.subscribe(to: "garden:memory", with: args, yielding: GardenMemory?.self).values {
                    guard !Task.isCancelled, let self else { return }
                    guard let value else { continue }
                    memory = value
                    memoryPhase = .ready
                }
            } catch {
                guard !Task.isCancelled, let self else { return }
                if memory == nil {
                    memoryPhase = .error(GardenStore.message(for: error))
                }
            }
        }
    }

    func retry(backend: FrolicBackend, route: E2ERoute?) {
        overview = nil
        phase = .loading
        loadedMemory = nil
        memory = nil
        memoryPhase = .loading
        start(backend: backend, route: route)
    }

    private static func message(for error: Error) -> String {
        "Check your connection and try again."
    }
}
