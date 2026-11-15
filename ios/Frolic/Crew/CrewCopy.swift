import Foundation

enum CrewCopy {
    static func names(_ list: [String]) -> String {
        switch list.count {
        case 0: return ""
        case 1: return list[0]
        case 2: return "\(list[0]) and \(list[1])"
        default: return list.dropLast().joined(separator: ", ") + " and " + list[list.count - 1]
        }
    }

    static func month(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMMM"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    static func shortDay(_ isoDay: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDay) else { return isoDay }
        if isoDay == CrewDay.today() { return "Today" }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.dateFormat = "MMM d"
        return display.string(from: date)
    }

    static func weekday(_ isoDay: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: isoDay) else { return "" }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US_POSIX")
        display.dateFormat = "EEEE"
        return display.string(from: date)
    }

    static func hour(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        let date = Date(timeIntervalSince1970: ms / 1000)
        let calendar = Calendar.current
        let minute = calendar.component(.minute, from: date)
        formatter.dateFormat = minute == 0 ? "h" : "h:mm"
        return formatter.string(from: date)
    }

    static func hourWithMeridiem(_ ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "h a"
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }

    static func money(_ cents: Int) -> String {
        let dollars = Double(cents) / 100
        if cents % 100 == 0 { return "$\(Int(dollars))" }
        return String(format: "$%.2f", dollars)
    }

    static func freeLine(_ free: CrewFreeWire?, now: Double) -> String {
        guard let free else { return "Not said yet" }
        switch free.state {
        case "busy":
            return "Busy now"
        case "window":
            guard let window = free.window else { return "Free now" }
            if window.start <= now { return "Free till \(hour(window.end))" }
            return "Free \(hour(window.start)) to \(hour(window.end))"
        default:
            guard let window = free.window else { return "Free now" }
            return "Free till \(hour(window.end))"
        }
    }

    static func distance(_ minutes: Int?) -> String? {
        guard let minutes, minutes > 0 else { return nil }
        return "\(minutes) min away"
    }
}

enum CrewDay {
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone.current
        return calendar
    }()

    static func today(_ offset: Int = 0) -> String {
        let date = CrewDay.calendar.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        return format(date)
    }

    static func tomorrow() -> String { today(1) }

    static func format(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func todayAt(hour: Int, minute: Int = 0) -> Double {
        let start = CrewDay.calendar.startOfDay(for: Date())
        let date = CrewDay.calendar.date(byAdding: DateComponents(hour: hour, minute: minute), to: start) ?? start
        return date.timeIntervalSince1970 * 1000
    }
}
