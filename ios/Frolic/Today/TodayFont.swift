import SwiftUI

private struct TodayFontModifier: ViewModifier {
    let weight: Font.Weight
    let design: Font.Design
    @ScaledMetric private var size: CGFloat

    init(size: CGFloat, weight: Font.Weight, design: Font.Design, relativeTo: Font.TextStyle) {
        self.weight = weight
        self.design = design
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: design))
    }
}

extension View {
    func todayFont(_ size: CGFloat, _ weight: Font.Weight = .regular, rounded: Bool = false, relativeTo: Font.TextStyle = .body) -> some View {
        modifier(TodayFontModifier(size: size, weight: weight, design: rounded ? .rounded : .default, relativeTo: relativeTo))
    }

    func storyFont(_ size: CGFloat, _ weight: Font.Weight = .heavy, relativeTo: Font.TextStyle = .title) -> some View {
        modifier(TodayFontModifier(size: size, weight: weight, design: .serif, relativeTo: relativeTo))
    }
}
