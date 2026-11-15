import SwiftUI

private struct FrolicEntranceModifier: ViewModifier {
    var index: Int
    var distance: CGFloat
    var step: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: reduceMotion || shown ? 0 : distance)
            .onAppear {
                guard !shown else { return }
                let delay = min(Double(max(index, 0)) * step, 0.45)
                withAnimation(animation.delay(delay)) { shown = true }
            }
    }

    private var animation: Animation {
        reduceMotion ? .easeOut(duration: 0.26) : FrolicSpring.standard
    }
}

extension View {
    func frolicEntrance(index: Int, distance: CGFloat = 12, step: Double = 0.045) -> some View {
        modifier(FrolicEntranceModifier(index: index, distance: distance, step: step))
    }
}

private struct FrolicRiseModifier: ViewModifier {
    var trigger: Bool
    var distance: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(trigger ? 1 : 0)
            .offset(y: trigger || reduceMotion ? 0 : distance)
            .animation(FrolicSpring.standard(reduceMotion: reduceMotion), value: trigger)
    }
}

extension View {
    func frolicRise(_ trigger: Bool, distance: CGFloat = 12) -> some View {
        modifier(FrolicRiseModifier(trigger: trigger, distance: distance))
    }
}
