import Foundation

@MainActor
struct TodayFixture {
    var view: TodayView
    var crew: CrewView
    var payment: TodayPayment?
    var sheet: TodayStore.Sheet?

    init?(route: E2ERoute) {
        guard route.screen == "today" else { return nil }
        let query = route.query
        let solo = query["solo"] != nil
        let state = route.state ?? "open"
        let start = TodayCopy.todayAt(hour: 16) + 30 * 60_000
        let now = Date().timeIntervalSince1970 * 1000
        let onlyIf = query["onlyIf"].map { names in Self.friends.filter { names.lowercased().contains($0.name.lowercased()) } } ?? []
        var phase = TodayPhase.open
        var myTap: TodayTap?
        var reveal: TodayReveal?
        var free = CrewFree(state: "now", window: TodayWindow(start: now, end: TodayCopy.todayAt(hour: 20)), minutesAway: 12, updatedAt: now)
        let paid = query["paid"] != nil

        switch state {
        case "waiting":
            phase = .waiting
            myTap = TodayTap(kind: "down", onlyIf: onlyIf, window: nil)
        case "reveal":
            phase = .on
            myTap = TodayTap(kind: "down", onlyIf: onlyIf, window: nil)
            reveal = Self.reveal(start: start, bloomAt: now + 2500, me: true, canHopIn: false)
        case "on":
            phase = .on
            myTap = TodayTap(kind: "down", onlyIf: [], window: nil)
            reveal = Self.reveal(start: start, bloomAt: now - 1000, me: true, canHopIn: false)
        case "hopin":
            phase = .on
            reveal = Self.reveal(start: start, bloomAt: now - 1000, me: false, canHopIn: true)
        case "full":
            phase = .on
            reveal = Self.reveal(start: start, bloomAt: now - 1000, me: false, canHopIn: false)
        case "faded":
            phase = .faded
        case "done":
            phase = .done
            reveal = Self.reveal(start: start, bloomAt: now - 3 * 3_600_000, me: true, canHopIn: false)
        case "off":
            free = CrewFree(state: "busy", window: nil, minutesAway: nil, updatedAt: now)
        case "none", "planning":
            phase = .none
        default:
            phase = solo ? .solo : .open
        }

        let members = [CrewMember(userId: Self.you.userId, name: "Ari", color: "tomato", photoUrl: nil, isMe: true, free: free)]
            + (solo ? [] : Self.friends.map {
                CrewMember(userId: $0.userId, name: $0.name, color: $0.color, photoUrl: $0.photoUrl, isMe: false,
                           free: CrewFree(state: "now", window: TodayWindow(start: now, end: TodayCopy.todayAt(hour: 20)), minutesAway: 6, updatedAt: now))
            })

        var plan = Self.plan(start: start)
        if paid {
            plan.title = "Kayaks at the Marina"
            plan.cost = 8
            plan.costLabel = "$8 each"
            plan.payUpFront = true
            plan.heroKey = "plan-outdoors"
            plan.chips = ["$8 each", "2 hours", "Calm before noon"]
            plan.meetSpot = "The boat ramp"
            plan.tip = "wear something that can get wet"
        }
        view = TodayView(
            phase: phase,
            groupName: "Sunset Crew",
            memberCount: Double(members.count),
            frolic: phase == .none ? nil : TodayFrolic(
                frolicId: "fixture-frolic",
                day: TodayCopy.dayString(),
                kind: solo ? "solo" : "daily",
                deadline: TodayCopy.todayAt(hour: 16),
                window: TodayWindow(start: TodayCopy.todayAt(hour: 12), end: TodayCopy.todayAt(hour: 23)),
                durationMinutes: 60,
                plan: plan,
                origin: query["free"] != nil ? "free" : "daily",
                notice: query["free"] != nil ? "Someone in your crew is free. \(plan.title) at \(TodayCopy.clock(start))?" : nil
            ),
            myTap: myTap,
            reveal: reveal,
            frolicNumber: 13
        )
        crew = CrewView(groupName: "Sunset Crew", members: members, holdEnabled: query["hold"] != "off")
        payment = Self.payment(query["pay"])
        sheet = Self.sheet(query["sheet"])
    }

    static func tomorrow() -> TodayView {
        let start = TodayCopy.todayAt(hour: 35)
        var plan = plan(start: start)
        plan.title = "Kayaks at the Marina"
        plan.heroKey = "plan-outdoors"
        plan.costLabel = "$8 each"
        return TodayView(
            phase: .on,
            groupName: "Sunset Crew",
            memberCount: 5,
            frolic: TodayFrolic(frolicId: "fixture-tomorrow", day: TodayCopy.tomorrowString(), kind: "daily", deadline: start, window: TodayWindow(start: start, end: start + 7_200_000), durationMinutes: 120, plan: plan, origin: "daily", notice: nil),
            myTap: nil,
            reveal: reveal(start: start, bloomAt: Date().timeIntervalSince1970 * 1000 - 60_000, me: false, canHopIn: true)
        )
    }

    static func avatar(_ key: String) -> String {
        "https://frolic.local/p/avatar/\(key)"
    }

    static let you = TodayPerson(userId: "you", name: "You", color: "tomato", photoUrl: nil, role: nil)
    static let maya = TodayPerson(userId: "maya", name: "Maya", color: "pink", photoUrl: avatar("maya"), role: nil)
    static let dev = TodayPerson(userId: "dev", name: "Dev", color: "cobalt", photoUrl: avatar("dev"), role: nil)
    static let jordan = TodayPerson(userId: "jordan", name: "Jordan", color: "moss", photoUrl: avatar("jordan"), role: nil)
    static let priya = TodayPerson(userId: "priya", name: "Priya", color: "marigold", photoUrl: avatar("priya"), role: nil)
    static let friends = [maya, dev, jordan, priya]

    static func reveal(start: Double, bloomAt: Double, me: Bool, canHopIn: Bool) -> TodayReveal {
        var going = [maya, dev]
        if me { going.insert(you, at: 0) }
        return TodayReveal(
            revealAt: bloomAt - 800,
            bloomAt: bloomAt,
            startsAt: start,
            endsAt: start + 3_600_000,
            snapAt: nil,
            going: going,
            me: TodayRevealMe(going: me, role: me ? "matched" : nil, bloomAt: me ? bloomAt : nil, hopInWaiting: false, canHopIn: canHopIn)
        )
    }

    static func plan(start: Double) -> TodayPlan {
        TodayPlan(
            title: "Sunset at Indian Rock",
            line: "Golden hour on the rocks, ten minutes from campus.",
            why: "you're into sunsets, it's free, and the sky's clear until dark.",
            heroKey: "plan-sunsets",
            cost: 0,
            costLabel: "Free",
            payUpFront: false,
            startsAt: start,
            sunsetAt: TodayCopy.todayAt(hour: 16) + 58 * 60_000,
            place: TodayPlace(placeId: "indian-rock", name: "Indian Rock", lat: 37.8925, lng: -122.2726, photoUrl: nil, neighborhood: "Northbrae"),
            chips: ["Free", "12 min walk", "Golden hour 4:28"],
            meetSpot: "Top of Indian Rock",
            tip: "bring a layer, it gets windy up there"
        )
    }

    static func payment(_ state: String?) -> TodayPayment? {
        switch state {
        case "due": TodayPayment(state: "due", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        case "paying": TodayPayment(state: "paying", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        case "held": TodayPayment(state: "held", kind: "hold", amountCents: 300, error: nil, paidNames: ["Maya"])
        case "returning": TodayPayment(state: "returning", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        case "returned": TodayPayment(state: "returned", kind: "hold", amountCents: 300, error: nil, paidNames: ["Maya", "Dev"])
        case "kept": TodayPayment(state: "kept", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        case "share": TodayPayment(state: "due", kind: "share", amountCents: 500, error: nil, paidNames: ["Maya", "Dev"])
        case "paid": TodayPayment(state: "paid", kind: "share", amountCents: 800, error: nil, paidNames: ["Maya", "Dev"])
        case "covered": TodayPayment(state: "covered", kind: "share", amountCents: 800, error: nil, paidNames: ["Maya", "Dev"])
        case "failed": TodayPayment(state: "failed", kind: "hold", amountCents: 300, error: "That didn't go through. Try again.", paidNames: [])
        case "sorting": TodayPayment(state: "sorting", kind: "hold", amountCents: 300, error: nil, paidNames: [])
        default: nil
        }
    }

    static func sheet(_ name: String?) -> TodayStore.Sheet? {
        switch name {
        case "onlyif": .onlyIf
        case "share": .share
        case "bail": .bail
        case "hold": .hold
        case "free": .free
        case "imfree": .imFree
        default: nil
        }
    }
}
