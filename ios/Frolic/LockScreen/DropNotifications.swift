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

    static let crewLineMax = 150
    static let crewLineFloor = 60

    static func crewFirst(_ crew: String?, _ line: String) -> String {
        let name = (crew ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !line.localizedCaseInsensitiveContains(name) else { return line }
        let room = max(crewLineFloor, crewLineMax - name.count - 2)
        return name + ": " + fitLine(line, room: room)
    }

    static func fitLine(_ line: String, room: Int) -> String {
        guard line.count > room else { return line }
        let cut = String(line.prefix(room))
        if let stop = cut.range(of: ". ", options: .backwards), stop.lowerBound != cut.startIndex {
            return String(cut[cut.startIndex..<stop.upperBound]).trimmingCharacters(in: .whitespaces)
        }
        let head = cut.lastIndex(of: " ").map { String(cut[cut.startIndex..<$0]) } ?? cut
        return head.trimmingCharacters(in: CharacterSet(charactersIn: ".,;: ")) + "\u{2026}"
    }

    static func content(free: [String], sunset: Date?, frolicId: String?, day: String, crew: String?) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.title = LockScreenCopy.dropTitle
        content.body = crewFirst(crew, LockScreenCopy.dropBody(free: free, sunset: sunset))
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
        guard await NotificationPermission.isAllowed() else { return }
        let fireAt = nextDropDate(after: now, snapshot: snapshot)
        let sameDay = Calendar.current.isDate(fireAt, inSameDayAs: now)
        let free = sameDay ? (snapshot?.free.map(\.name) ?? []) : []
        let sunset = sunsetDate(on: fireAt, lat: snapshot?.placeLat, lng: snapshot?.placeLng)
        let content = content(free: free, sunset: sunset, frolicId: nil, day: LockScreenStore.localDay(fireAt), crew: snapshot?.groupName)
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fireAt)
        let request = UNNotificationRequest(identifier: nextDropId, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false))
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func postSoon(free: [String], sunset: Date?, frolicId: String?, crew: String?, after seconds: TimeInterval) async {
        guard await NotificationPermission.isAllowed() else { return }
        let content = content(free: free, sunset: sunset, frolicId: frolicId, day: LockScreenStore.localDay(), crew: crew)
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
        let line = switch apiError {
        case .server(let code, let message) where code == "CLOSED" || code == "NOT_FOUND": message
        case .offline: "You're offline, so your answer didn't send. Open Frolic to try again."
        default: LockScreenCopy.tapFailed
        }
        content.body = crewFirst(LockScreenStore.snapshot?.groupName, line)
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
