import Foundation

enum GardenSentence {
    static func from(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first else { return trimmed }
        let capped = first.uppercased() + trimmed.dropFirst()
        return ".!?".contains(capped.last ?? " ") ? capped : capped + "."
    }
}
