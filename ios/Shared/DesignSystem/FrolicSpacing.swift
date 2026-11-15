import SwiftUI

enum FrolicSpacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 20
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 40
}

enum FrolicRadius {
    static let seed: CGFloat = 10
    static let chip: CGFloat = 14
    static let tile: CGFloat = 18
    static let group: CGFloat = 22
    static let card: CGFloat = 24
    static let packet: CGFloat = 28
    static let sheet: CGFloat = 34

    static func nested(_ outer: CGFloat, padding: CGFloat) -> CGFloat {
        max(0, outer - padding)
    }
}

extension View {
    func frolicCorner(_ radius: CGFloat) -> some View {
        clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    func frolicBorder(_ radius: CGFloat, color: Color = FrolicColor.hairline, lineWidth: CGFloat = 0.5) -> some View {
        overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(color, lineWidth: lineWidth))
    }
}
