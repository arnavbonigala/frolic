import SwiftUI
import UIKit

enum StoryColor {
    static let page = dynamic(light: 0xFFF8EC, dark: 0x12162A)
    static let ink = dynamic(light: 0x23180F, dark: 0xF6EBDD)
    static let muted = dynamic(light: 0x6B5F55, dark: 0xCDBFAE)
    static let faint = dynamic(light: 0x8F8379, dark: 0x9A90A6)
    static let rule = dynamic(light: 0x23180F, dark: 0xF6EBDD, alpha: 0.12)
    static let accent = dynamic(light: 0x2E8A4E, dark: 0x8EE3A8)
    static let control = dynamic(light: 0xFFFFFF, dark: 0x23294A)
    static let controlStroke = dynamic(light: 0x23180F, dark: 0xF6EBDD, alpha: 0.14)
    static let lantern = Color(hex: 0x34A160)

    private static func dynamic(light: UInt32, dark: UInt32, alpha: CGFloat = 1) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: alpha
            )
        })
    }
}

struct NightStars: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        Canvas { context, size in
            guard scheme == .dark else { return }
            var seed: UInt64 = 0xC0FFEE1234
            func next() -> Double {
                seed = seed &* 6364136223846793005 &+ 1442695040888963407
                return Double(seed >> 33) / Double(1 << 31)
            }
            let band: CGFloat = 26
            for index in 0..<22 {
                let side = next()
                let x = index.isMultiple(of: 2) ? 4 + side * band : size.width - 4 - side * band
                let y = next() * size.height
                let r = 0.8 + next() * 1.8
                var star = Path()
                star.move(to: CGPoint(x: x, y: y - r * 2))
                star.addQuadCurve(to: CGPoint(x: x + r * 2, y: y), control: CGPoint(x: x, y: y))
                star.addQuadCurve(to: CGPoint(x: x, y: y + r * 2), control: CGPoint(x: x, y: y))
                star.addQuadCurve(to: CGPoint(x: x - r * 2, y: y), control: CGPoint(x: x, y: y))
                star.addQuadCurve(to: CGPoint(x: x, y: y - r * 2), control: CGPoint(x: x, y: y))
                context.fill(star, with: .color(Color(hex: 0xFFE7A8).opacity(0.18 + next() * 0.35)))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
