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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    fileprivate struct Star {
        var point: CGPoint
        var radius: Double
        var alpha: Double
    }

    private static let twinklers: Set<Int> = [3, 10, 17]

    var body: some View {
        GeometryReader { proxy in
            let stars = Self.stars(in: proxy.size)
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    for (index, star) in stars.enumerated() where reduceMotion || !Self.twinklers.contains(index) {
                        context.fill(Self.path(star), with: .color(Color(hex: 0xFFE7A8).opacity(star.alpha)))
                    }
                }
                if !reduceMotion {
                    ForEach(Array(Self.twinklers.sorted().enumerated()), id: \.element) { order, index in
                        if index < stars.count {
                            Twinkle(star: stars[index], period: 4.6 + Double(order) * 1.3, delay: Double(order) * 1.7)
                        }
                    }
                }
            }
            .opacity(scheme == .dark ? 1 : 0)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static func stars(in size: CGSize) -> [Star] {
        var seed: UInt64 = 0xC0FFEE1234
        func next() -> Double {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            return Double(seed >> 33) / Double(1 << 31)
        }
        let band: CGFloat = 26
        return (0..<22).map { index in
            let side = next()
            let x = index.isMultiple(of: 2) ? 4 + side * band : size.width - 4 - side * band
            let y = next() * size.height
            let r = 0.8 + next() * 1.8
            return Star(point: CGPoint(x: x, y: y), radius: r, alpha: 0.18 + next() * 0.35)
        }
    }

    fileprivate static func path(_ star: Star) -> Path {
        let x = star.point.x, y = star.point.y, r = star.radius
        var path = Path()
        path.move(to: CGPoint(x: x, y: y - r * 2))
        path.addQuadCurve(to: CGPoint(x: x + r * 2, y: y), control: CGPoint(x: x, y: y))
        path.addQuadCurve(to: CGPoint(x: x, y: y + r * 2), control: CGPoint(x: x, y: y))
        path.addQuadCurve(to: CGPoint(x: x - r * 2, y: y), control: CGPoint(x: x, y: y))
        path.addQuadCurve(to: CGPoint(x: x, y: y - r * 2), control: CGPoint(x: x, y: y))
        return path
    }

    private struct Twinkle: View {
        var star: Star
        var period: Double
        var delay: Double
        @State private var lit = false

        var body: some View {
            Self.shape(star)
                .fill(Color(hex: 0xFFE7A8))
                .frame(width: star.radius * 4, height: star.radius * 4)
                .scaleEffect(lit ? 1.35 : 0.8)
                .opacity(lit ? min(1, star.alpha + 0.45) : star.alpha * 0.5)
                .position(star.point)
                .onAppear {
                    withAnimation(.easeInOut(duration: period / 2).repeatForever(autoreverses: true).delay(delay)) {
                        lit = true
                    }
                }
        }

        private static func shape(_ star: Star) -> some Shape {
            let r = star.radius
            return NightStars.path(Star(point: CGPoint(x: r * 2, y: r * 2), radius: r, alpha: 1))
        }
    }
}
