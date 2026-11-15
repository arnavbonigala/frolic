import Foundation
import UserNotifications

enum DropNotifications {
    static let category = "FROLIC_DROP"
    static let downAction = "FROLIC_DOWN"
    static let onlyIfAction = "FROLIC_ONLY_IF"
    static let notTodayAction = "FROLIC_NOT_TODAY"
    static let nextDropId = "frolic.drop.next"
    static let dropHour = 15
    static let dropMinute = 1

    static func registerCategory() {
        let down = UNNotificationAction(identifier: downAction, title: LockScreenCopy.down, options: [], icon: UNNotificationActionIcon(systemImageName: "leaf.fill"))
        let onlyIf = UNNotificationAction(identifier: onlyIfAction, title: LockScreenCopy.onlyIf, options: [.foreground], icon: UNNotificationActionIcon(systemImageName: "person.2"))
        let notToday = UNNotificationAction(identifier: notTodayAction, title: LockScreenCopy.notToday, options: [], icon: UNNotificationActionIcon(systemImageName: "moon"))
        let drop = UNNotificationCategory(
            identifier: category,
            actions: [down, onlyIf, notToday],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: "Today's plan",
            options: [.customDismissAction]
        )
        UNUserNotificationCenter.current().setNotificationCategories([drop])
    }

    static func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        }
        return settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    static func content(free: [String], sunset: Date?, frolicId: String?, day: String) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = LockScreenCopy.dropTitle
        content.body = LockScreenCopy.dropBody(free: free, sunset: sunset)
        content.categoryIdentifier = category
        content.threadIdentifier = "frolic.drop"
        content.interruptionLevel = .active
        content.relevanceScore = 1
        content.sound = .default
        var info: [String: String] = ["day": day]
        if let frolicId { info["frolicId"] = frolicId }
        content.userInfo = info
        return content
    }

    static func nextDropDate(after now: Date = .now, snapshot: LockScreenSnapshot?) -> Date {
        let calendar = Calendar.current
        let todayDrop = calendar.date(bySettingHour: dropHour, minute: dropMinute, second: 0, of: now) ?? now
        let todayDone = snapshot?.day == LockScreenStore.localDay(now) && snapshot?.frolicId != nil
        if now < todayDrop && !todayDone { return todayDrop }
        return calendar.date(byAdding: .day, value: 1, to: todayDrop) ?? todayDrop
    }

    static func scheduleNext(snapshot: LockScreenSnapshot?, now: Date = .now) async {
        guard await requestAuthorization() else { return }
        let fireAt = nextDropDate(after: now, snapshot: snapshot)
        let sameDay = Calendar.current.isDate(fireAt, inSameDayAs: now)
        let free = sameDay ? (snapshot?.free.map(\.name) ?? []) : []
        let sunset = sunsetDate(on: fireAt, lat: snapshot?.placeLat, lng: snapshot?.placeLng)
        let content = content(free: free, sunset: sunset, frolicId: nil, day: LockScreenStore.localDay(fireAt))
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
        let request = UNNotificationRequest(identifier: nextDropId, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func postSoon(free: [String], sunset: Date?, frolicId: String?, after seconds: TimeInterval) async {
        guard await requestAuthorization() else { return }
        let content = content(free: free, sunset: sunset, frolicId: frolicId, day: LockScreenStore.localDay())
        let request = UNNotificationRequest(
            identifier: "frolic.drop.now",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func postFailure(_ error: Error) async {
        let content = UNMutableNotificationContent()
        content.title = "Frolic"
        let apiError = error as? FrolicAPIError
        switch apiError {
        case .server(let code, let message) where code == "CLOSED" || code == "NOT_FOUND":
            content.body = message
        case .offline:
            content.body = "You're offline, so your answer didn't send. Open Frolic to try again."
        default:
            content.body = LockScreenCopy.tapFailed
        }
        content.threadIdentifier = "frolic.drop"
        let request = UNNotificationRequest(identifier: "frolic.tap.failed", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func sunsetDate(on date: Date, lat: Double?, lng: Double?) -> Date? {
        guard let lat, let lng else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let local = Calendar.current.dateComponents([.year, .month, .day], from: date)
        guard let noon = utc.date(from: DateComponents(year: local.year, month: local.month, day: local.day, hour: 12)) else { return nil }
        let julianDay = noon.timeIntervalSince1970 / 86400 + 2440587.5
        let n = (julianDay - 2451545.0 + 0.0008).rounded()
        let meanNoon = n - lng / 360
        let anomaly = (357.5291 + 0.98560028 * meanNoon).truncatingRemainder(dividingBy: 360)
        let m = anomaly * .pi / 180
        let center = 1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m)
        let lambda = ((anomaly + center + 180 + 102.9372).truncatingRemainder(dividingBy: 360)) * .pi / 180
        let transit = 2451545.0 + meanNoon + 0.0053 * sin(m) - 0.0069 * sin(2 * lambda)
        let declination = asin(sin(lambda) * sin(23.4397 * .pi / 180))
        let phi = lat * .pi / 180
        let cosOmega = (sin(-0.833 * .pi / 180) - sin(phi) * sin(declination)) / (cos(phi) * cos(declination))
        guard (-1...1).contains(cosOmega) else { return nil }
        let set = transit + acos(cosOmega) * 180 / .pi / 360
        return Date(timeIntervalSince1970: (set - 2440587.5) * 86400)
    }
}
