import EventKit
import Foundation

struct FreeDay: Identifiable, Equatable {
    var id: String
    var label: String
    var value: String
    var window: DateInterval?
    var isFree: Bool

    static let demo: [FreeDay] = [
        FreeDay(id: "today", label: "Today", value: "Free now till 8 PM", window: nil, isFree: true),
        FreeDay(id: "sun", label: "Sun", value: "Free all day", window: nil, isFree: true),
        FreeDay(id: "mon", label: "Mon", value: "Free 4 to 9 PM", window: nil, isFree: true),
        FreeDay(id: "tue", label: "Tue", value: "Free 6 to 11 PM", window: nil, isFree: true),
        FreeDay(id: "wed", label: "Wed", value: "Free 2 to 9 PM", window: nil, isFree: true),
    ]
}

enum CalendarRead {
    enum Access: Equatable {
        case notAsked
        case granted
        case denied
    }

    static let usageKey = "NSCalendarsFullAccessUsageDescription"
    static let wakeHour = 8
    static let sleepHour = 23

    static var isPackaged: Bool { Bundle.main.object(forInfoDictionaryKey: usageKey) != nil }

    static var access: Access {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized: .granted
        case .denied, .restricted, .writeOnly: .denied
        case .notDetermined: .notAsked
        @unknown default: .denied
        }
    }

    static func requestAccess() async -> Access {
        guard isPackaged else { return .denied }
        let store = EKEventStore()
        do {
            let granted = try await store.requestFullAccessToEvents()
            return granted ? .granted : .denied
        } catch {
            return .denied
        }
    }

    static func week(now: Date = Date()) -> [FreeDay] {
        guard access == .granted else { return [] }
        let store = EKEventStore()
        let calendar = Calendar.current
        let days = 5
        var out: [FreeDay] = []
        for offset in 0..<days {
            guard let dayStart = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)) else { continue }
            let open = calendar.date(byAdding: .hour, value: wakeHour, to: dayStart) ?? dayStart
            let close = calendar.date(byAdding: .hour, value: sleepHour, to: dayStart) ?? dayStart
            let from = max(open, now)
            guard from < close else {
                let id = identifier(offset, now: now)
                out.append(FreeDay(id: id, label: label(offset, now: now), value: offset == 0 ? "Busy now" : "Free all day", window: nil, isFree: offset != 0))
                continue
            }
            let events = store.events(matching: store.predicateForEvents(withStart: dayStart, end: close, calendars: nil))
            let busy = merged(events.map { ($0.startDate, $0.endDate) })
            let window = largestFree(from: from, to: close, busy: busy)
            let id = identifier(offset, now: now)
            let name = label(offset, now: now)
            if let window {
                out.append(FreeDay(id: id, label: name, value: describe(window, from: from, close: close, offset: offset), window: window, isFree: true))
            } else {
                out.append(FreeDay(id: id, label: name, value: offset == 0 ? "Busy now" : "Busy all day", window: nil, isFree: false))
            }
        }
        return out
    }

    static func todayWindow(_ days: [FreeDay]) -> DateInterval? {
        days.first(where: { $0.id == "today" })?.window
    }

    private static func merged(_ intervals: [(Date, Date)]) -> [(Date, Date)] {
        let sorted = intervals.sorted { $0.0 < $1.0 }
        var out: [(Date, Date)] = []
        for interval in sorted {
            if let last = out.last, interval.0 <= last.1 {
                out[out.count - 1] = (last.0, max(last.1, interval.1))
            } else {
                out.append(interval)
            }
        }
        return out
    }

    private static func largestFree(from: Date, to: Date, busy: [(Date, Date)]) -> DateInterval? {
        var cursor = from
        var best: DateInterval?
        for interval in busy {
            if interval.0 > cursor {
                let gap = DateInterval(start: cursor, end: min(interval.0, to))
                if gap.duration >= 2700, gap.duration > (best?.duration ?? 0) { best = gap }
            }
            cursor = max(cursor, interval.1)
            if cursor >= to { break }
        }
        if cursor < to {
            let gap = DateInterval(start: cursor, end: to)
            if gap.duration >= 2700, gap.duration > (best?.duration ?? 0) { best = gap }
        }
        return best
    }

    private static func describe(_ window: DateInterval, from: Date, close: Date, offset: Int) -> String {
        let startsNow = window.start.timeIntervalSince(from) < 300
        let endsAtClose = close.timeIntervalSince(window.end) < 60
        if startsNow { return "Free now till " + hour(window.end) }
        if endsAtClose { return "Free from " + hour(window.start) }
        return "Free " + hour(window.start) + " to " + hour(window.end)
    }

    private static func hour(_ date: Date) -> String {
        let calendar = Calendar.current
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let hour = parts.hour ?? 0
        let minute = parts.minute ?? 0
        let display = hour % 12 == 0 ? 12 : hour % 12
        let suffix = hour < 12 ? "AM" : "PM"
        if minute == 0 { return "\(display) \(suffix)" }
        return String(format: "%d:%02d %@", display, minute, suffix)
    }

    private static func identifier(_ offset: Int, now: Date) -> String {
        offset == 0 ? "today" : label(offset, now: now).lowercased()
    }

    private static func label(_ offset: Int, now: Date) -> String {
        if offset == 0 { return "Today" }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        let date = Calendar.current.date(byAdding: .day, value: offset, to: now) ?? now
        return formatter.string(from: date)
    }
}
