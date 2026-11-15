import SwiftUI

enum FrolicTextStyle: CaseIterable {
    case huge
    case largeTitle
    case title
    case sheetTitle
    case button
    case headline
    case body
    case bodyEmphasis
    case subheadline
    case pill
    case chip
    case footnote
    case flowerName
    case countdown

    var size: CGFloat {
        switch self {
        case .huge: 58
        case .largeTitle: 34
        case .title: 30
        case .sheetTitle: 22
        case .button: 17
        case .headline: 17
        case .body: 17
        case .bodyEmphasis: 17
        case .subheadline: 15
        case .pill: 15
        case .chip: 13
        case .footnote: 13
        case .flowerName: 12
        case .countdown: 22
        }
    }

    var weight: Font.Weight {
        switch self {
        case .huge, .largeTitle, .title, .sheetTitle, .countdown: .heavy
        case .button, .headline: .bold
        case .bodyEmphasis, .pill, .chip, .flowerName: .semibold
        case .body, .subheadline, .footnote: .regular
        }
    }

    var isRounded: Bool {
        switch self {
        case .huge, .largeTitle, .title, .sheetTitle, .button, .countdown: true
        default: false
        }
    }

    var tracking: CGFloat {
        switch self {
        case .huge: -1
        case .largeTitle, .title: -0.3
        default: 0
        }
    }

    var relativeTo: Font.TextStyle {
        switch self {
        case .huge, .largeTitle: .largeTitle
        case .title: .title
        case .sheetTitle, .countdown: .title2
        case .button, .headline: .headline
        case .body, .bodyEmphasis: .body
        case .subheadline, .pill: .subheadline
        case .chip, .footnote: .footnote
        case .flowerName: .caption
        }
    }

    var name: String {
        switch self {
        case .huge: "Huge"
        case .largeTitle: "Large title"
        case .title: "Title"
        case .sheetTitle: "Sheet title"
        case .button: "Button"
        case .headline: "Headline"
        case .body: "Body"
        case .bodyEmphasis: "Body emphasis"
        case .subheadline: "Subheadline"
        case .pill: "Pill"
        case .chip: "Chip"
        case .footnote: "Footnote"
        case .flowerName: "Flower name"
        case .countdown: "Countdown"
        }
    }
}

private struct FrolicFontModifier: ViewModifier {
    let style: FrolicTextStyle
    @ScaledMetric private var size: CGFloat

    init(style: FrolicTextStyle) {
        self.style = style
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        content
            .font(.system(size: size, weight: style.weight, design: style.isRounded ? .rounded : .default))
            .tracking(style.tracking)
    }
}

extension View {
    func frolicFont(_ style: FrolicTextStyle) -> some View {
        modifier(FrolicFontModifier(style: style))
    }
}

extension Font {
    static func frolic(_ style: FrolicTextStyle) -> Font {
        #if canImport(UIKit)
        let base = UIFont.systemFont(ofSize: style.size, weight: style.uiWeight)
        let descriptor = base.fontDescriptor.withDesign(style.isRounded ? .rounded : .default) ?? base.fontDescriptor
        let font = UIFont(descriptor: descriptor, size: style.size)
        return Font(UIFontMetrics(forTextStyle: style.uiTextStyle).scaledFont(for: font))
        #else
        return .system(size: style.size, weight: style.weight, design: style.isRounded ? .rounded : .default)
        #endif
    }
}

extension FrolicTextStyle {
    var uiWeight: UIFont.Weight {
        switch weight {
        case .heavy, .black: .heavy
        case .bold: .bold
        case .semibold: .semibold
        case .medium: .medium
        default: .regular
        }
    }

    var uiTextStyle: UIFont.TextStyle {
        switch relativeTo {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .footnote: .footnote
        case .caption, .caption2: .caption1
        default: .body
        }
    }
}
