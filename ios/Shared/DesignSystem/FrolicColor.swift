import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension Color {
    static func adaptive(_ light: UInt32, _ dark: UInt32, alpha: CGFloat = 1) -> Color {
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

enum FrolicColor {
    static let ink = Color.adaptive(0x23180F, 0xF6EBDD)
    static let secondaryText = Color.adaptive(0x6B5F55, 0xCDBFAE)
    static let tertiaryText = Color.adaptive(0x7D7167, 0xA79DB3)
    static let chipText = Color.adaptive(0x4F443A, 0xDDD2C4)
    static let placeholderText = Color.adaptive(0x8F8379, 0x8E86A0)
    static let cream = Color.adaptive(0xFFF8EC, 0x12162A)
    static let paper = Color.adaptive(0xFFFFFF, 0x1E2342)
    static let line = Color.adaptive(0x23180F, 0xF6EBDD, alpha: 0.10)
    static let hairline = Color.adaptive(0x23180F, 0xF6EBDD, alpha: 0.07)
    static let chip = Color.adaptive(0xF4EEE4, 0x262C4E)
    static let sun = Color.adaptive(0x2E8A4E, 0x8EE3A8)
    static let free = Color(hex: 0x3DAA5C)
    static let idle = Color(hex: 0xB5ABA1)
    static let band = Color(hex: 0xFFBE2E)
    static let bandText = Color(hex: 0x4A2A00)
    static let skyTop = Color.adaptive(0xCFE5FF, 0x12162A)
    static let skyMid = Color.adaptive(0xE9F1FB, 0x232A56)
    static let meadow = Color.adaptive(0xDCEFD6, 0x1E3A2C)
    static let meadowDeep = Color.adaptive(0xCFE8C5, 0x12162A)
    static let stem = Color(hex: 0x3E9B52)
    static let leaf = Color(hex: 0x4CAF5E)
    static let pollen = Color(hex: 0xFFD25E)
    static let pollenRing = Color(hex: 0xF29A00)
    static let disabled = Color.adaptive(0xCFC6BB, 0x3A4064)
    static let night = Color(hex: 0x141414)
    static let focus = Color(hex: 0x2C4FD6)
}

enum FlowerColor: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
    case pink, cobalt, moss, marigold, tomato, lilac

    var id: String { rawValue }

    var name: String { rawValue.capitalized }

    var petal: Color {
        switch self {
        case .pink: Color(hex: 0xFF7AB0)
        case .cobalt: Color(hex: 0x4A6FF5)
        case .moss: Color(hex: 0x46B566)
        case .marigold: Color(hex: 0xFFBE2E)
        case .tomato: Color(hex: 0xFF6440)
        case .lilac: Color(hex: 0xAE86FF)
        }
    }

    var deep: Color {
        switch self {
        case .pink: Color(hex: 0xE9508E)
        case .cobalt: Color(hex: 0x2C4FD6)
        case .moss: Color(hex: 0x2E9149)
        case .marigold: Color(hex: 0xF29A00)
        case .tomato: Color(hex: 0xE2441F)
        case .lilac: Color(hex: 0x8B5EF2)
        }
    }
}

struct SkyBackground: View {
    var body: some View {
        FrolicColor.cream.ignoresSafeArea()
    }
}
