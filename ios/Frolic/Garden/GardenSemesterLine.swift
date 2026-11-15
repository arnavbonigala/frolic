import SwiftUI

struct GardenSemesterLine: View {
    var frolics: Int
    var places: Int
    var friends: Int

    private var parts: [String] {
        [
            frolics > 0 ? (frolics == 1 ? "1 frolic" : "\(frolics) frolics") : nil,
            places > 0 ? (places == 1 ? "1 place" : "\(places) places") : nil,
            friends > 0 ? (friends == 1 ? "1 friend" : "\(friends) friends") : nil,
        ].compactMap { $0 }
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
        var frolics = 0
        var places = Set<String>()
        var friends = Set<String>()
        for memory in memories where memory.youWent {
            frolics += 1
            places.insert(memory.title)
            guard let me else { continue }
            for person in memory.going where person.userId != me {
                friends.insert(person.userId)
            }
        }
        return (frolics, places.count, friends.count)
    }
}
