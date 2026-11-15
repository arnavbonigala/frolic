import SwiftUI

enum FrolicButtonKind {
    case primary
    case secondary
    case text
}

struct FrolicButtonStyle: ButtonStyle {
    var kind: FrolicButtonKind
    var fillsWidth: Bool

    func makeBody(configuration: Configuration) -> some View {
        FrolicButtonBody(kind: kind, fillsWidth: fillsWidth, configuration: configuration)
    }
}

private struct FrolicButtonBody: View {
    let kind: FrolicButtonKind
    let fillsWidth: Bool
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.95 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: configuration.isPressed)
    }

    @ViewBuilder
    private var label: some View {
        switch kind {
        case .primary, .secondary:
            configuration.label
                .frolicFont(.button)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: 54)
                .foregroundStyle(foreground)
                .background(Capsule().fill(background))
                .overlay(Capsule().strokeBorder(border, lineWidth: 1.5))
                .contentShape(Capsule())
        case .text:
            configuration.label
                .frolicFont(.bodyEmphasis)
                .foregroundStyle(isEnabled ? FrolicColor.chipText : FrolicColor.tertiaryText)
                .padding(.horizontal, 16)
                .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: 44)
                .contentShape(Rectangle())
                .opacity(configuration.isPressed ? 0.6 : 1)
        }
    }

    private var foreground: Color {
        guard isEnabled else { return FrolicColor.secondaryText }
        return kind == .primary ? .white : FrolicColor.ink
    }

    private var background: Color {
        guard isEnabled else { return .clear }
        return kind == .primary ? Color(hex: 0x34A160) : FrolicColor.paper
    }

    private var border: Color {
        guard isEnabled else { return FrolicColor.disabled }
        return kind == .primary ? .clear : FrolicColor.ink.opacity(0.14)
    }
}

extension ButtonStyle where Self == FrolicButtonStyle {
    static var frolicPrimary: FrolicButtonStyle { FrolicButtonStyle(kind: .primary, fillsWidth: true) }
    static var frolicSecondary: FrolicButtonStyle { FrolicButtonStyle(kind: .secondary, fillsWidth: false) }
    static var frolicSecondaryWide: FrolicButtonStyle { FrolicButtonStyle(kind: .secondary, fillsWidth: true) }
    static var frolicText: FrolicButtonStyle { FrolicButtonStyle(kind: .text, fillsWidth: false) }
}

struct CircleIconButton: View {
    var systemImage: String
    var label: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(FrolicColor.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(FrolicColor.paper.opacity(0.9)))
                .overlay(Circle().stroke(FrolicColor.ink.opacity(0.1), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.1), radius: 6, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
