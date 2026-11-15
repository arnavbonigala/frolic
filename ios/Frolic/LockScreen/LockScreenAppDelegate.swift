import ActivityKit
import UIKit
import UserNotifications
import WidgetKit

enum LockScreenInbox {
    enum Pending: String {
        case onlyIf
        case imFree
    }

    private static let key = "lockscreen.pending"

    static var pending: Pending? {
        AppGroup.defaults.string(forKey: key).flatMap(Pending.init(rawValue:))
    }

    static func set(_ pending: Pending?) {
        AppGroup.defaults.set(pending?.rawValue, forKey: key)
    }

    static func take() -> Pending? {
        defer { set(nil) }
        return pending
    }
}

final class LockScreenAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        DropNotifications.registerCategory()
        Task { @MainActor in LockScreenSync.shared.start() }
        return true
    }

    @MainActor
    func handle(_ url: URL) {
        guard url.scheme == "frolic" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let query = Dictionary((components?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { _, last in last })
        if url.host == "today", query["imfree"] == "1" {
            LockScreenInbox.set(.imFree)
            return
        }
        if url.host == "signin" || query["token"] != nil {
            SharedSession.userId = nil
            SharedSession.name = nil
            LockScreenStore.snapshot = nil
            Task { await LockScreenSync.shared.refresh() }
            if url.host == "signin" { return }
        }
        #if DEBUG || E2E
        guard url.host == "e2e" else { return }
        let route = (components?.path ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        Task { await LockScreenDemo.apply(route: route, query: query) }
        #endif
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        switch response.actionIdentifier {
        case DropNotifications.downAction:
            await answer("down")
        case DropNotifications.notTodayAction:
            await answer("notToday")
        case DropNotifications.onlyIfAction:
            LockScreenInbox.set(.onlyIf)
            await MainActor.run {
                if let url = URL(string: "frolic://today") { UIApplication.shared.open(url) }
            }
        default:
            break
        }
    }

    private func answer(_ kind: String) async {
        do {
            try await LockScreenActions.tap(kind, source: .notification)
        } catch {
            await DropNotifications.postFailure(error)
        }
    }
}

#if DEBUG || E2E
enum LockScreenDemo {
    static let sampleFree = ["Maya", "Dev", "Jordan"]

    @MainActor
    static func apply(route: String, query: [String: String]) async {
        let parts = route.split(separator: ":", maxSplits: 1).map(String.init)
        let screen = parts.first ?? ""
        let state = parts.count > 1 ? parts[1] : nil
        switch screen {
        case "drop":
            let live = query["live"] == "1" ? LockScreenStore.snapshot : nil
            let sunset = live.flatMap { DropNotifications.sunsetDate(on: .now, lat: $0.placeLat, lng: $0.placeLng) }
                ?? Calendar.current.date(bySettingHour: 16, minute: 58, second: 0, of: .now)
            await DropNotifications.postSoon(
                free: live?.free.map(\.name) ?? sampleFree,
                sunset: sunset,
                frolicId: live?.frolicId,
                after: Double(query["delay"] ?? "") ?? 4
            )
        case "meadow":
            LockScreenStore.e2eMeadowState = state == "live" ? nil : state
            MeadowSnapshot.reload()
        case "widget":
            LockScreenStore.e2eWidgetState = state == "live" ? nil : state
            WidgetCenter.shared.reloadTimelines(ofKind: LockScreenStore.widgetKind)
        case "la":
            await startSampleActivity(stage: state)
        case "today" where state == "on":
            await startSampleActivity(stage: "leave")
        default:
            break
        }
    }

    @MainActor
    static func startSampleActivity(stage: String?) async {
        if stage == "end" {
            await LiveActivityController.endAll()
            return
        }
        let maya = ActivityPerson(id: "maya", name: "Maya", color: .pink)
        let dev = ActivityPerson(id: "dev", name: "Dev", color: .cobalt)
        let you = ActivityPerson(id: "you", name: "You", color: .lilac)
        var state = FrolicActivityAttributes.ContentState(
            leaveAt: .now.addingTimeInterval(8 * 60),
            status: "You, Maya and Dev",
            going: [you, maya, dev]
        )
        switch stage {
        case "otw":
            state.stage = .onTheWay
            state.arriveAt = .now.addingTimeInterval(12 * 60)
            state.status = "Maya's there. Dev is 4 min out."
        case "arrived":
            state.stage = .arrived
            state.status = "You're here. Dev is on the way."
        default:
            break
        }
        if let current = LiveActivityController.current, current.attributes.frolicId == "demo" {
            await current.update(ActivityContent(state: state, staleDate: nil))
            return
        }
        await LiveActivityController.endAll()
        let attributes = FrolicActivityAttributes(planTitle: "Sunset at Indian Rock", place: "Indian Rock", meetTime: "4:30", color: .lilac, frolicId: "demo")
        _ = try? LiveActivityController.start(attributes, state: state)
    }
}
#endif
