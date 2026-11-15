import Foundation
import WidgetKit

enum TapSource: String {
    case app
    case notification
}

enum LockScreenActions {
    static func tap(_ kind: String, source: TapSource) async throws {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let previous = LockScreenStore.snapshot
        if var optimistic = previous, optimistic.phase == .open || optimistic.phase == .solo || optimistic.phase == .waiting {
            optimistic.phase = kind == "down" ? .waiting : .open
            optimistic.tookDayOff = kind == "notToday"
            optimistic.tappedDown = kind == "down"
            optimistic.onlyIf = []
            optimistic.fetchedAt = .now
            LockScreenStore.save(optimistic)
        }
        do {
            let frolicId = try await openFrolicId(previous)
            try await FrolicHTTP(deploymentURL: credentials.url).mutation("taps:tap", [
                "deviceToken": credentials.token,
                "frolicId": frolicId,
                "kind": kind,
                "source": source.rawValue,
            ])
            await refresh()
        } catch {
            if let previous { LockScreenStore.save(previous) }
            LockScreenStore.lastFailure = error as? FrolicAPIError ?? .unreadable
            WidgetCenter.shared.reloadTimelines(ofKind: LockScreenStore.widgetKind)
            throw error
        }
    }

    static func hopIn() async throws -> String {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let frolicId = try await currentFrolicId()
        let result = try await FrolicHTTP(deploymentURL: credentials.url).mutation(
            "frolics:hopIn", ["deviceToken": credentials.token, "frolicId": frolicId], as: String.self
        )
        await refresh()
        return result
    }

    static func setOnMyWay(minutes: Int) async throws {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let frolicId = try await currentFrolicId()
        try await FrolicHTTP(deploymentURL: credentials.url).mutation("etas:setMine", [
            "deviceToken": credentials.token,
            "frolicId": frolicId,
            "minutes": max(0, min(600, minutes)),
            "onTheWay": true,
        ])
    }

    static func checkIn() async throws {
        guard let credentials = SharedSession.credentials else { throw FrolicAPIError.signedOut }
        let frolicId = try await currentFrolicId()
        _ = try await FrolicHTTP(deploymentURL: credentials.url).mutation(
            "checkins:checkInMe", ["deviceToken": credentials.token, "frolicId": frolicId, "method": "manual"], as: String.self
        )
    }

    @discardableResult
    static func refresh() async -> LockScreenSnapshot? {
        do {
            let snapshot = try await LockScreenStore.fetch()
            LockScreenStore.save(snapshot)
            return snapshot
        } catch {
            LockScreenStore.lastFailure = error as? FrolicAPIError ?? .unreadable
            WidgetCenter.shared.reloadTimelines(ofKind: LockScreenStore.widgetKind)
            return nil
        }
    }

    private static func currentFrolicId() async throws -> String {
        if let id = LockScreenStore.snapshot?.frolicId { return id }
        guard let id = try await LockScreenStore.fetch().frolicId else {
            throw FrolicAPIError.server(code: "NOT_FOUND", message: LockScreenCopy.notYet)
        }
        return id
    }

    private static func openFrolicId(_ cached: LockScreenSnapshot?) async throws -> String {
        if let cached, let id = cached.frolicId, [.open, .solo, .waiting].contains(cached.phase), cached.day == LockScreenStore.localDay() {
            return id
        }
        for attempt in 0..<3 {
            let fresh = try await LockScreenStore.fetch()
            if let id = fresh.frolicId, [.open, .solo, .waiting].contains(fresh.phase) { return id }
            if attempt < 2 { try await Task.sleep(for: .seconds(4)) }
        }
        throw FrolicAPIError.server(code: "CLOSED", message: LockScreenCopy.notYet)
    }
}
