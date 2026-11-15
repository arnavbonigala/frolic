import SwiftUI

struct GardenSemesterLine: View {
    var frolics: Int
    var places: Int
    var friends: Int

    private var parts: [String] {
        [
            frolics > 0 ? Self.count(frolics, "frolic") : nil,
            places > 0 ? Self.count(places, "place") : nil,
            friends > 0 ? Self.count(friends, "friend") : nil,
        ].compactMap { $0 }
    }

    static func phrase(frolics: Int, places: Int, friends: Int) -> String {
        [count(frolics, "frolic"), count(places, "place"), count(friends, "friend")]
            .joined(separator: " · ")
    }

    private static func count(_ value: Int, _ noun: String) -> String {
        value == 1 ? "1 \(noun)" : "\(value) \(noun)s"
    }

    var body: some View {
        if frolics > 0 {
            VStack(alignment: .leading, spacing: 2) {
                Text("This semester")
                    .font(.system(size: 12, weight: .bold))
                    .tracking(0.3)
                    .foregroundStyle(FrolicColor.tertiaryText)
                Text(parts.joined(separator: ", "))
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("garden.semester")
        }
    }
}

extension GardenOverview {
    func semester(me: String?) -> (frolics: Int, places: Int, friends: Int) {
        let mine = memories.filter(\.youWent)
        let friends: Set<String> = me.map { id in Set(mine.flatMap(\.going).map(\.userId).filter { $0 != id }) } ?? []
        return (mine.count, Set(mine.map(\.title)).count, friends.count)
    }
}
