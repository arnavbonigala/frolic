import Foundation

enum WidgetSamples {
    static let maya = LockScreenPerson(id: "maya", name: "Maya", color: .pink)
    static let dev = LockScreenPerson(id: "dev", name: "Dev", color: .cobalt)
    static let jordan = LockScreenPerson(id: "jordan", name: "Jordan", color: .moss)
    static let priya = LockScreenPerson(id: "priya", name: "Priya", color: .marigold)
    static let you = LockScreenPerson(id: "you", name: "You", color: .lilac)

    static var base: LockScreenSnapshot {
        let calendar = Calendar.current
        let startsAt = calendar.date(bySettingHour: 16, minute: 30, second: 0, of: .now) ?? .now
        return LockScreenSnapshot(
            fetchedAt: .now,
            phase: .open,
            groupName: "Sunset Crew",
            frolicId: nil,
            day: LockScreenStore.localDay(),
            planTitle: "Sunset at Indian Rock",
            placeName: "Indian Rock",
            placeLat: 37.8925,
            placeLng: -122.2722,
            heroKey: "plan-sunsets",
            startsAt: startsAt,
            endsAt: startsAt.addingTimeInterval(90 * 60),
            sunsetAt: calendar.date(bySettingHour: 16, minute: 58, second: 0, of: .now),
            deadline: calendar.date(bySettingHour: 16, minute: 0, second: 0, of: .now),
            costLabel: "Free",
            me: you,
            free: [maya, dev, jordan],
            going: [],
            onlyIf: [],
            tookDayOff: false,
            tappedDown: false,
            revealAt: nil,
            amGoing: false,
            canHopIn: false,
            hopInWaiting: false
        )
    }

    static func snapshot(_ state: String) -> LockScreenSnapshot? {
        var s = base
        switch state {
        case "open": break
        case "solo":
            s.phase = .solo
            s.free = []
        case "waiting":
            s.phase = .waiting
            s.tappedDown = true
        case "onlyif":
            s.phase = .waiting
            s.tappedDown = true
            s.onlyIf = ["Maya"]
        case "dayoff":
            s.phase = .open
            s.tookDayOff = true
        case "on":
            s.phase = .on
            s.tappedDown = true
            s.going = [you, maya, dev]
            s.amGoing = true
            s.revealAt = .now.addingTimeInterval(-60)
        case "hopin":
            s.phase = .on
            s.going = [maya, dev]
            s.canHopIn = true
            s.revealAt = .now.addingTimeInterval(-60)
        case "faded": s.phase = .faded
        case "done":
            s.phase = .done
            s.going = [you, maya, dev]
            s.amGoing = true
        case "none":
            s.phase = .none
            s.planTitle = nil
        default: return nil
        }
        return s
    }

    static func entries(_ state: String, now: Date) -> [TodayEntry]? {
        switch state {
        case "loading": return [TodayEntry(date: now, content: .loading)]
        case "signedout": return [TodayEntry(date: now, content: .signedOut)]
        case "error": return [TodayEntry(date: now, content: .failure(.server(code: "UNKNOWN", message: "Something went wrong on Frolic's side."), base))]
        case "offline": return [TodayEntry(date: now, content: .failure(.offline, base))]
        case "reveal":
            var pending = base
            pending.phase = .on
            pending.going = [you, maya, dev]
            pending.amGoing = true
            pending.tappedDown = true
            pending.revealAt = now.addingTimeInterval(20)
            return [
                TodayEntry(date: now, content: .snapshot(pending.revealGated(at: now))),
                TodayEntry(date: now.addingTimeInterval(20), content: .snapshot(pending)),
            ]
        default:
            return snapshot(state).map { [TodayEntry(date: now, content: .snapshot($0))] }
        }
    }
}
