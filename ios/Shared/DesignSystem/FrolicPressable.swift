import SwiftUI

struct FrolicPressableStyle: ButtonStyle {
    var scale: CGFloat
    var haptic: Bool

    init(scale: CGFloat = 0.97, haptic: Bool = true) {
        self.scale = scale
        self.haptic = haptic
    }

    func makeBody(configuration: Configuration) -> some View {
        FrolicPressableBody(scale: scale, haptic: haptic, configuration: configuration)
    }
}

private struct FrolicPressableBody: View {
    let scale: CGFloat
    let haptic: Bool
    let configuration: ButtonStyleConfiguration
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
            .opacity(pressedOpacity)
            .animation(FrolicSpring.gesture(reduceMotion: reduceMotion), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                guard pressed, haptic, isEnabled else { return }
                #if canImport(UIKit)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                #endif
            }
            .contentShape(Rectangle())
    }

    private var pressedOpacity: Double {
        if !isEnabled { return 0.45 }
        return configuration.isPressed && reduceMotion ? 0.82 : 1
    }
}

extension ButtonStyle where Self == FrolicPressableStyle {
    static var frolicPressable: FrolicPressableStyle { FrolicPressableStyle() }
    static var frolicPressableQuiet: FrolicPressableStyle { FrolicPressableStyle(scale: 0.98, haptic: false) }
}
