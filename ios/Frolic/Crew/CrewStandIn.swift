import Foundation

enum PlanPainted {
    static func hero(for title: String) -> String? {
        let lowered = title.lowercased()
        if lowered.contains("sunset") || lowered.contains("golden") || lowered.contains("pier") {
            return "plan-sunsets"
        }
        if lowered.contains("pizza") || lowered.contains("noodle") || lowered.contains("food") || lowered.contains("taco") {
            return "plan-late-night-food"
        }
        if lowered.contains("bowl") || lowered.contains("game") || lowered.contains("arcade") || lowered.contains("karaoke") {
            return "plan-games"
        }
        if lowered.contains("kayak") || lowered.contains("hike") || lowered.contains("picnic") || lowered.contains("marina") || lowered.contains("glade") {
            return "plan-outdoors"
        }
        if lowered.contains("free") || lowered.contains("park") || lowered.contains("walk") {
            return "plan-free-stuff"
        }
        return nil
    }
}

enum CrewStandIn {
    static func view(route: E2ERoute?) -> CrewScene? {
        guard let route, route.screen == "crew", route.query["token"] == nil else { return nil }
        switch route.state {
        case nil, "ready", "friend", "invite":
            return sampleScene(went: false)
        case "went":
            return sampleScene(went: true)
        case "nobody-free":
            return busyCrew()
        case "fund-empty":
            var sample = sampleScene(went: false)
            sample.fund = CrewFund(balanceCents: 0, rows: [])
            return sample
        default:
            return nil
        }
    }

    static func friend(route: E2ERoute?) -> CrewRow? {
        guard let route, route.screen == "crew", route.state == "friend" else { return nil }
        return CrewStandIn.view(route: route)?.rows.first
    }

    private static func sampleScene(went: Bool) -> CrewScene {
        let me = CrewRow(
            id: "you",
            name: "You",
            color: .tomato,
            photoURL: nil,
            photoAsset: "p_you",
            isMe: true,
            status: went ? .went : .free("Free till 8"),
            minutesAway: nil,
            lookingNow: true
        )
        var rows: [CrewRow] = [
            CrewRow(id: "maya", name: "Maya", color: .pink, photoURL: nil, photoAsset: "portrait-maya", isMe: false,
                    status: went ? .wentWithYou : .free("Free till 8"), minutesAway: went ? nil : 6, lookingNow: true),
            CrewRow(id: "dev", name: "Dev", color: .cobalt, photoURL: nil, photoAsset: "portrait-dev", isMe: false,
                    status: went ? .wentWithYou : .free("Free 4 to 9"), minutesAway: went ? nil : 9, lookingNow: true),
            CrewRow(id: "jordan", name: "Jordan", color: .moss, photoURL: nil, photoAsset: "portrait-jordan", isMe: false,
                    status: went ? .busy : .free("Free till 6"), minutesAway: went ? nil : 15, lookingNow: false),
            CrewRow(id: "priya", name: "Priya", color: .marigold, photoURL: nil, photoAsset: "portrait-priya", isMe: false,
                    status: .free(went ? "Free till 10" : "Free 5 to 10"), minutesAway: 11, lookingNow: false),
        ]
        if went {
            rows[2].minutesAway = nil
        }
        var lately: [CrewLatelyRow] = [
            CrewLatelyRow(id: "cheese", title: "Cheese Board", names: "Maya, Dev and Jordan", day: "Nov 8",
                          colors: [.pink, .cobalt, .moss]),
            CrewLatelyRow(id: "bowling", title: "Bowling", names: "Dev, Jordan, Priya and Maya", day: "Nov 2",
                          colors: [.cobalt, .moss, .marigold, .pink]),
            CrewLatelyRow(id: "glade", title: "The Glade picnic", names: "Priya and Maya", day: "Oct 26",
                          colors: [.marigold, .pink]),
        ]
        if went {
            lately.insert(
                CrewLatelyRow(id: "rock", title: "Indian Rock", names: "You, Maya and Dev", day: "Today",
                              colors: [.tomato, .pink, .cobalt]),
                at: 0
            )
        }
        let favorites: [CrewFavoriteRow] = [
            CrewFavoriteRow(id: "rock", title: went ? "Sunset at Indian Rock (you went)" : "Sunset at Indian Rock",
                            count: went ? "6 times" : "5 times"),
            CrewFavoriteRow(id: "cheese", title: "Cheese Board pizza", count: "4 times"),
            CrewFavoriteRow(id: "bowling", title: "Bowling at the Union", count: "2 times"),
        ]
        let fund = CrewFund(
            balanceCents: 600,
            rows: [
                CrewFundRow(id: "f1", text: "A no-show added $3.", day: "Today", kind: .added),
                CrewFundRow(id: "f2", text: "A no-show added $3.", day: "Nov 8", kind: .added),
                CrewFundRow(id: "f3", text: "The Frolic Fund covered $3.", day: "Nov 2", kind: .covered),
                CrewFundRow(id: "f4", text: "A no-show added $3.", day: "Oct 26", kind: .added),
            ]
        )
        return CrewScene(
            groupName: "Sunset Crew",
            subtitle: "5 of you · the crew started in September",
            me: me,
            rows: rows,
            nobodyFree: false,
            comingUp: CrewComingUp(lead: "Sunday 11 AM:", body: "Kayaks at the Marina. Maya and Dev are going.", heroAsset: "plan-outdoors"),
            lately: lately,
            favorites: favorites,
            fund: fund,
            wentToday: went,
            todayTitle: "Sunset at Indian Rock",
            holdEnabled: true
        )
    }

    private static func busyCrew() -> CrewScene {
        var scene = sampleScene(went: false)
        scene.nobodyFree = true
        scene.rows = scene.rows.map { row in
            var row = row
            row.status = .busy
            row.minutesAway = nil
            row.lookingNow = false
            return row
        }
        scene.me.status = .free("Free till 8")
        return scene
    }
}
