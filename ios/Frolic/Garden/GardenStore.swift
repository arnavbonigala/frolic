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
    private(set) var onThisDay: GardenOnThisDay?
    private(set) var myUserId: String?
    @ObservationIgnored private var meTask: Task<Void, Never>?
    @ObservationIgnored private var onThisDayTask: Task<Void, Never>?
    private(set) var memoryPhase: ScreenPhase = .loading

    @ObservationIgnored private var overviewTask: Task<Void, Never>?
    @ObservationIgnored private var memoryTask: Task<Void, Never>?
    @ObservationIgnored private var loadedMemory: String?

    func start(backend: FrolicBackend, route: E2ERoute?) {
        overviewTask?.cancel()
        #if DEBUG || E2E
        if let seeded = GardenFixtures.overview(route: route) {
            overview = seeded
            onThisDay = GardenFixtures.onThisDay(route: route)
            myUserId = "maya"
            phase = seeded.isEmpty ? .empty : .ready
            return
        }
        #endif
        guard backend.isConfigured, let client = backend.client else {
            phase = .error(BackendError.notConfigured.localizedDescription)
            return
        }
        guard let identity = GardenIdentity.resolve() else {
            phase = .empty
            return
        }
        phase = .loading
        let args: [String: ConvexEncodable?] = ["deviceToken": identity.deviceToken, "groupId": identity.groupId]
        meTask?.cancel()
        meTask = Task { [weak self] in
            struct Me: Decodable { let userId: String }
            let meArgs: [String: ConvexEncodable?] = ["deviceToken": identity.deviceToken]
            do {
                for try await value in client.subscribe(to: "users:me", with: meArgs, yielding: Me?.self).values {
                    guard !Task.isCancelled, let self else { return }
                    myUserId = value?.userId
                }
            } catch {}
        }
        onThisDayTask?.cancel()
        onThisDayTask = Task { [weak self] in
            do {
                for try await value in client.subscribe(to: "garden:onThisDay", with: args, yielding: GardenOnThisDay?.self).values {
                    guard !Task.isCancelled, let self else { return }
                    onThisDay = (value?.hasContent == true) ? value : nil
                }
            } catch {
                guard !Task.isCancelled, let self else { return }
                onThisDay = nil
            }
        }
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
        guard let identity = GardenIdentity.resolve() else {
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
