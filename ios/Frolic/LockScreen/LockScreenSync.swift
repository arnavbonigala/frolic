import ActivityKit
import Combine
import ConvexMobile
import Foundation
import UIKit
import WidgetKit

@MainActor
final class LockScreenSync {
    static let shared = LockScreenSync()

    private var subscription: AnyCancellable?
    private var observers: [NSObjectProtocol] = []
    private var refreshing = false
    private var refreshAgain = false

    func start() {
        SharedSession.deploymentURL = ConvexConfig.deploymentURL ?? SharedSession.deploymentURL
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
                Task { @MainActor in await LockScreenSync.shared.becameActive() }
            },
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                Task { @MainActor in LockScreenSync.shared.subscription = nil }
            },
        ]
        Task { await HeroCache.export() }
    }

    func becameActive() async {
        await LockScreenStore.syncClock()
        subscribe()
        await refresh()
    }

    func refresh() async {
        guard !refreshing else {
            refreshAgain = true
            return
        }
        refreshing = true
        defer {
            refreshing = false
            if refreshAgain {
                refreshAgain = false
                Task { await refresh() }
            }
        }
        let snapshot = await LockScreenActions.refresh()
        guard let snapshot else { return }
        if let minutes = LiveActivityController.walkMinutes(to: snapshot) {
            SharedSession.walkMinutes = minutes
        }
        await LiveActivityController.sync(with: snapshot, etas: await etas(for: snapshot))
        await DropNotifications.scheduleNext(snapshot: snapshot)
        if let delay = snapshot.revealAt.map({ $0.timeIntervalSinceNow }), delay > 0 {
            Task {
                try? await Task.sleep(for: .seconds(delay + 0.2))
                WidgetCenter.shared.reloadTimelines(ofKind: LockScreenStore.widgetKind)
            }
        }
    }

    private func subscribe() {
        guard subscription == nil, let token = SharedSession.deviceToken, let groupId = SharedSession.groupId,
              let client = FrolicBackend.shared.client
        else { return }
        let args: [String: ConvexEncodable?] = ["deviceToken": token, "groupId": groupId]
        subscription = client.subscribe(to: "frolics:today", with: args, yielding: TodayResponse.self)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { _ in
                Task { @MainActor in await LockScreenSync.shared.refresh() }
            })
    }

    private func etas(for snapshot: LockScreenSnapshot) async -> [EtaRow] {
        guard snapshot.phase == .on, snapshot.amGoing, let frolicId = snapshot.frolicId,
              let credentials = SharedSession.credentials
        else { return [] }
        return (try? await FrolicHTTP(deploymentURL: credentials.url).query(
            "etas:forFrolic", ["deviceToken": credentials.token, "frolicId": frolicId], as: [EtaRow].self
        )) ?? []
    }
}
