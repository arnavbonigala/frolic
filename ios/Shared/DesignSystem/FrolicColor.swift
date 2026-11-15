import SwiftUI

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

enum FrolicColor {
    static let ink = Color(hex: 0x23180F)
    static let secondaryText = Color(hex: 0x6B5F55)
    static let tertiaryText = Color(hex: 0x8F8379)
    static let chipText = Color(hex: 0x4F443A)
    static let placeholderText = Color(hex: 0xA2978C)
    static let cream = Color(hex: 0xFFF8EC)
    static let paper = Color.white
    static let line = Color(hex: 0x23180F, opacity: 0.09)
    static let hairline = Color(hex: 0x23180F, opacity: 0.06)
    static let chip = Color(hex: 0xF4EEE4)
    static let sun = Color(hex: 0xFF6A2A)
    static let free = Color(hex: 0x3DAA5C)
    static let idle = Color(hex: 0xB5ABA1)
    static let band = Color(hex: 0xFFBE2E)
    static let bandText = Color(hex: 0x4A2A00)
    static let skyTop = Color(hex: 0xCFE5FF)
    static let skyMid = Color(hex: 0xE9F1FB)
    static let meadow = Color(hex: 0xDCEFD6)
    static let meadowDeep = Color(hex: 0xCFE8C5)
    static let stem = Color(hex: 0x3E9B52)
    static let leaf = Color(hex: 0x4CAF5E)
    static let pollen = Color(hex: 0xFFD25E)
    static let pollenRing = Color(hex: 0xF29A00)
    static let disabled = Color(hex: 0xCFC6BB)
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
        ZStack(alignment: .top) {
            FrolicColor.cream
            LinearGradient(
                stops: [
                    .init(color: FrolicColor.skyTop, location: 0),
                    .init(color: FrolicColor.skyMid, location: 170.0 / 380.0),
                    .init(color: FrolicColor.cream, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 380)
        }
        .ignoresSafeArea()
    }
}
