import SwiftUI

private struct TodayFontModifier: ViewModifier {
    let weight: Font.Weight
    let rounded: Bool
    @ScaledMetric private var size: CGFloat

    init(size: CGFloat, weight: Font.Weight, rounded: Bool, relativeTo: Font.TextStyle) {
        self.weight = weight
        self.rounded = rounded
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: rounded ? .rounded : .default))
    }
}

extension View {
    func todayFont(_ size: CGFloat, _ weight: Font.Weight = .regular, rounded: Bool = false, relativeTo: Font.TextStyle = .body) -> some View {
        modifier(TodayFontModifier(size: size, weight: weight, rounded: rounded, relativeTo: relativeTo))
    }
}
