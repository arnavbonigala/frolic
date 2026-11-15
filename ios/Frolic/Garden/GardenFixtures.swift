#if DEBUG || E2E
import Foundation

enum GardenFixtures {
    private static let maya = GardenPerson(userId: "maya", name: "Maya", color: .pink, photoUrl: nil)
    private static let dev = GardenPerson(userId: "dev", name: "Dev", color: .cobalt, photoUrl: nil)
    private static let jordan = GardenPerson(userId: "jordan", name: "Jordan", color: .moss, photoUrl: nil)
    private static let priya = GardenPerson(userId: "priya", name: "Priya", color: .marigold, photoUrl: nil)

    private static let weekLine = "golden-hour chasers who keep it under $10, with a soft spot for a sunny lawn."

    private static let today = GardenMemoryRow(
        frolicId: "fixture-today",
        title: "Sunset at Indian Rock",
        dateLine: "Today",
        heroKey: "plan-sunsets",
        photoUrl: nil,
        youWent: true,
        going: [maya, dev]
    )

    private static let history: [GardenMemoryRow] = [
        GardenMemoryRow(frolicId: "fixture-1", title: "Cheese Board pizza", dateLine: "Nov 8", heroKey: "plan-late-night-food", photoUrl: nil, youWent: false, going: [maya, dev, jordan]),
        GardenMemoryRow(frolicId: "fixture-2", title: "Bowling", dateLine: "Nov 2", heroKey: "plan-games", photoUrl: nil, youWent: false, going: [dev, jordan, priya, maya]),
        GardenMemoryRow(frolicId: "fixture-3", title: "Picnic on the Glade", dateLine: "Oct 26", heroKey: "plan-outdoors", photoUrl: nil, youWent: false, going: [priya, maya]),
        GardenMemoryRow(frolicId: "fixture-4", title: "The Marina", dateLine: "Oct 19", heroKey: "plan-sunsets", photoUrl: nil, youWent: false, going: [maya, dev, priya]),
        GardenMemoryRow(frolicId: "fixture-5", title: "Beach day", dateLine: "Oct 12", heroKey: "plan-free-stuff", photoUrl: nil, youWent: false, going: [jordan, priya, dev, maya]),
    ]

    static func overview(route: E2ERoute?) -> GardenOverview? {
        guard let route else { return nil }
        guard route.screen == "garden" || route.screen == "memory" else { return nil }
        if route.query["fixture"] == nil { return nil }
        let went = route.query["went"] != "0"
        let memories = went ? [today] + history : history
        return GardenOverview(
            groupName: "Sunset Crew",
            youWent: went,
            count: Double(memories.count + 7),
            sinceLine: went ? "12 before you, 1 with you" : "all before you joined",
            weekLine: weekLine,
            taste: nil,
            fund: GardenFundLine(line: "The Frolic Fund covered $8 at Kayaks at the Marina.", frolicTitle: "Kayaks at the Marina"),
            memories: memories,
            health: health(route: route),
            collection: collection,
            milestone: GardenMilestone(reached: 7, next: 10, nextAt: nil, line: "3 more frolics to unlock the bench")
        )
    }

    private static let collection = GardenCollection(varieties: [
        GardenVariety(key: "golden-poppy", name: "Golden poppy", count: 3, unlocked: true, hint: nil),
        GardenVariety(key: "lupine", name: "Lupine", count: 1, unlocked: true, hint: nil),
        GardenVariety(key: "night-jasmine", name: "Night jasmine", count: 0, unlocked: false, hint: "Grows after a late-night food frolic"),
        GardenVariety(key: "sweet-pea", name: "Sweet pea", count: 0, unlocked: false, hint: "Grows after a game night"),
        GardenVariety(key: "daisy", name: "Daisy", count: 2, unlocked: true, hint: nil),
        GardenVariety(key: "ranunculus", name: "Ranunculus", count: 0, unlocked: false, hint: "Grows after a paid drop"),
    ])

    private static func health(route: E2ERoute) -> GardenHealth {
        let state = GardenHealthState(rawValue: route.query["health"] ?? "fine") ?? .fine
        switch state {
        case .thriving: return GardenHealth(state: .thriving, daysSince: 1, line: "Your garden is glowing. Two frolics this week.", cta: nil)
        case .fine: return GardenHealth(state: .fine, daysSince: 3, line: "Your garden is doing well.", cta: nil)
        case .thirsty: return GardenHealth(state: .thirsty, daysSince: 7, line: "Your garden would love a frolic soon.", cta: "I'm free")
        case .wilting: return GardenHealth(state: .wilting, daysSince: 14, line: "It has been a while. The flowers are resting, and they never wilt for good.", cta: "I'm free")
        }
    }

    static func onThisDay(route: E2ERoute?) -> GardenOnThisDay? {
        guard route?.query["otd"] != nil else { return nil }
        return GardenOnThisDay(frolicId: "fixture-1", title: "Cheese Board pizza", line: "Maya, Dev and Jordan, one week ago today.", dateLine: "1 WEEK AGO TODAY", heroKey: "plan-late-night-food", photoUrl: nil)
    }

    static func memory(row: GardenMemoryRow, route: E2ERoute?) -> GardenMemory? {
        guard route?.screen == "garden" || route?.screen == "memory" else { return nil }
        guard route?.query["fixture"] != nil else { return nil }
        return GardenMemory(
            frolicId: row.frolicId,
            title: row.title,
            dateLine: row.dateLine,
            caption: caption(row: row),
            heroKey: row.heroKey,
            place: place(row: row),
            fundLine: row.frolicId == "fixture-4" ? "The Frolic Fund covered $8 of this one." : nil,
            going: row.youWent ? [maya, dev] : row.going,
            photos: row.going.enumerated().map { index, _ in
                GardenPhoto(
                    url: "",
                    caption: nil,
                    heroKey: [row.heroKey, "plan-outdoors", "plan-free-stuff"][index % 3]
                )
            }
        )
    }

    private static func caption(row: GardenMemoryRow) -> String {
        let people = row.youWent ? row.going.count + 1 : row.going.count
        let count = people == 1 ? "just me" : people == 2 ? "two of us" : people == 3 ? "three of us" : "four of us"
        return "\(count) at \(row.title.lowercased()) on \(row.dateLine.lowercased())."
    }

    private static func place(row: GardenMemoryRow) -> GardenPlace? {
        switch row.frolicId {
        case "fixture-today": GardenPlace(name: "Indian Rock Park", heroKey: "plan-sunsets")
        case "fixture-1": GardenPlace(name: "Cheese Board Pizza", heroKey: "plan-late-night-food")
        case "fixture-2": GardenPlace(name: "the Union lanes", heroKey: "plan-games")
        case "fixture-3": GardenPlace(name: "Memorial Glade", heroKey: "plan-outdoors")
        case "fixture-4": GardenPlace(name: "the Berkeley Marina", heroKey: "plan-sunsets")
        default: GardenPlace(name: "Indian Rock", heroKey: "plan-free-stuff")
        }
    }
}
#endif
