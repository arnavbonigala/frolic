import Foundation

enum SampleData {
    static let maya = FlowerPerson(name: "Maya", color: .pink, photo: "portrait-maya")
    static let dev = FlowerPerson(name: "Dev", color: .cobalt, photo: "portrait-dev")
    static let jordan = FlowerPerson(name: "Jordan", color: .moss, photo: "portrait-jordan")
    static let priya = FlowerPerson(name: "Priya", color: .marigold, photo: "portrait-priya")
    static let you = FlowerPerson(name: "You", color: .tomato, photo: "p_you")
    static let youWithoutPhoto = FlowerPerson(name: "You", color: .tomato)

    static let friends = [maya, dev, jordan, priya]

    static let freeLines = [
        "Maya": "Free till 8 · 6 min away",
        "Dev": "Free 4 to 9 · 9 min away",
        "Jordan": "Free till 6 · 15 min away",
        "Priya": "Free 5 to 10 · 11 min away",
    ]
}
