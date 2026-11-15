import ActivityKit
import CoreLocation
import Foundation

enum LiveActivityController {
    static var areActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    @discardableResult
    static func start(_ attributes: FrolicActivityAttributes, leaveAt: Date, status: String) throws -> Activity<FrolicActivityAttributes> {
        try start(attributes, state: .init(leaveAt: leaveAt, status: status))
    }

    @discardableResult
    static func start(_ attributes: FrolicActivityAttributes, state: FrolicActivityAttributes.ContentState) throws -> Activity<FrolicActivityAttributes> {
        let content = ActivityContent(state: state, staleDate: staleDate(for: state))
        return try Activity.request(attributes: attributes, content: content, pushType: nil)
    }

    static func endAll() async {
        for activity in Activity<FrolicActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    static var current: Activity<FrolicActivityAttributes>? {
        Activity<FrolicActivityAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
    }

    static func sync(with snapshot: LockScreenSnapshot, etas: [EtaRow] = [], now: Date = .now) async {
        let live = snapshot.revealGated(at: now)
        guard live.phase == .on, live.amGoing, let frolicId = live.frolicId, let startsAt = live.startsAt,
              live.endsAt.map({ now < $0 }) ?? true
        else {
            for activity in Activity<FrolicActivityAttributes>.activities where activity.attributes.frolicId.isEmpty == false {
                await activity.end(nil, dismissalPolicy: live.phase == .done ? .default : .immediate)
            }
            return
        }
        let going = live.going.map { ActivityPerson(id: $0.id, name: $0.name, color: $0.color) }
        let existing = Activity<FrolicActivityAttributes>.activities.first { $0.attributes.frolicId == frolicId }
        var state = existing?.content.state ?? .init(leaveAt: live.leaveAt ?? startsAt, status: "")
        state.leaveAt = live.leaveAt ?? startsAt
        state.going = going
        let mine = etas.first { $0.userId == live.me?.id }
        if state.stage == .leave, let mine, mine.onTheWay {
            state.stage = mine.minutes == 0 ? .arrived : .onTheWay
            state.arriveAt = now.addingTimeInterval(mine.minutes * 60)
        }
        state.status = status(for: state.stage, snapshot: live, etas: etas)
        if let existing {
            await existing.update(ActivityContent(state: state, staleDate: staleDate(for: state)))
            return
        }
        guard areActivitiesEnabled, now < startsAt.addingTimeInterval(30 * 60) else { return }
        for activity in Activity<FrolicActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        let attributes = FrolicActivityAttributes(
            planTitle: live.planTitle ?? live.placeName ?? "Today's frolic",
            place: (live.placeName ?? "The spot").replacingOccurrences(of: "^the ", with: "The ", options: .regularExpression),
            meetTime: LockScreenCopy.time(startsAt),
            color: live.me?.color ?? .marigold,
            frolicId: frolicId
        )
        _ = try? start(attributes, state: state)
    }

    static func markOnMyWay(minutes: Int, now: Date = .now) async {
        guard let activity = current, LockScreenStore.snapshot?.frolicId == activity.attributes.frolicId || activity.attributes.frolicId == "demo" else { return }
        var state = activity.content.state
        state.stage = .onTheWay
        state.arriveAt = now.addingTimeInterval(Double(minutes) * 60)
        if let snapshot = LockScreenStore.snapshot?.revealGated(at: now), snapshot.phase == .on {
            state.status = status(for: .onTheWay, snapshot: snapshot, etas: [])
        }
        await activity.update(ActivityContent(state: state, staleDate: staleDate(for: state)))
    }

    static func markArrived(frolicId: String? = nil) async {
        guard let activity = current, frolicId == nil || activity.attributes.frolicId == frolicId else { return }
        var state = activity.content.state
        state.stage = .arrived
        state.arriveAt = nil
        if let snapshot = LockScreenStore.snapshot?.revealGated(at: .now), snapshot.phase == .on {
            state.status = status(for: .arrived, snapshot: snapshot, etas: [])
        }
        let end = LockScreenStore.snapshot?.endsAt ?? .now.addingTimeInterval(2 * 3600)
        await activity.update(ActivityContent(state: state, staleDate: end))
    }

    static func status(for stage: FrolicActivityAttributes.ContentState.Stage, snapshot: LockScreenSnapshot, etas: [EtaRow]) -> String {
        let meId = snapshot.me?.id
        let others = snapshot.going.filter { $0.id != meId }
        let names = others.map(\.name)
        let parts = others.compactMap { person -> String? in
            guard let eta = etas.first(where: { $0.userId == person.id }) else { return nil }
            if eta.minutes == 0 { return "\(person.name)'s there." }
            return eta.onTheWay ? "\(person.name) is \(Int(eta.minutes)) min out." : nil
        }
        if !parts.isEmpty { return parts.joined(separator: " ") }
        switch stage {
        case .leave:
            return names.isEmpty ? "It's on." : "You, \(LockScreenCopy.list(names))"
        case .onTheWay:
            return names.isEmpty ? "On your way" : "On your way to \(LockScreenCopy.list(names))"
        case .arrived:
            return names.isEmpty ? "You're here" : "You're here. \(LockScreenCopy.list(names)) \(names.count == 1 ? "is" : "are") on the way."
        }
    }

    static func walkMinutes(to snapshot: LockScreenSnapshot?) -> Int? {
        guard let lat = snapshot?.placeLat, let lng = snapshot?.placeLng, let here = currentLocation() else { return nil }
        let meters = here.distance(from: CLLocation(latitude: lat, longitude: lng))
        return max(1, Int((meters * 1.25 / 80).rounded(.up)))
    }

    private static func currentLocation() -> CLLocation? {
        if let data = UserDefaults.standard.data(forKey: "e2e.simulatedLocation"),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Double],
           let lat = json["latitude"], let lng = json["longitude"] {
            return CLLocation(latitude: lat, longitude: lng)
        }
        return CLLocationManager().location
    }

    private static func staleDate(for state: FrolicActivityAttributes.ContentState) -> Date {
        switch state.stage {
        case .leave: state.leaveAt
        case .onTheWay: state.arriveAt ?? state.leaveAt
        case .arrived: state.leaveAt.addingTimeInterval(3 * 3600)
        }
    }
}
