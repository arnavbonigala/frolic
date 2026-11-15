import Foundation

enum SampleData {
    static let maya = FlowerPerson(name: "Maya", color: .pink, photo: "p_maya")
    static let dev = FlowerPerson(name: "Dev", color: .cobalt, photo: "p_dev")
    static let jordan = FlowerPerson(name: "Jordan", color: .moss, photo: "p_jordan")
    static let priya = FlowerPerson(name: "Priya", color: .marigold, photo: "p_priya")
    static let you = FlowerPerson(name: "You", color: .tomato, photo: "p_you")
    static let youWithoutPhoto = FlowerPerson(name: "You", color: .tomato)

    static let friends = [maya, dev, jordan, priya]

    static let freeLines = [
        "Maya": "Free till 8 · 6 min away",
        "Dev": "Free till 9 · 9 min away",
        "Jordan": "Free till 6 · 15 min away",
        "Priya": "Free till 10 · 11 min away",
    ]
}
