import AppIntents

struct FrolicShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ImDownIntent(),
            phrases: ["I'm down in \(.applicationName)", "Say yes in \(.applicationName)"],
            shortTitle: "I'm down",
            systemImageName: "leaf.fill"
        )
        AppShortcut(
            intent: NotTodayIntent(),
            phrases: ["Not today in \(.applicationName)", "Take the day off in \(.applicationName)"],
            shortTitle: "Not today",
            systemImageName: "moon"
        )
        AppShortcut(
            intent: OnMyWayIntent(),
            phrases: ["I'm on my way in \(.applicationName)"],
            shortTitle: "I'm on my way",
            systemImageName: "figure.walk"
        )
        AppShortcut(
            intent: HopInIntent(),
            phrases: ["Hop in with \(.applicationName)"],
            shortTitle: "Hop in",
            systemImageName: "plus.circle"
        )
    }
}
