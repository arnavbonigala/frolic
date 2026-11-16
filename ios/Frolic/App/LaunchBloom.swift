import SwiftUI

struct LaunchBloom: View {
    var onFinish: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false
    @State private var sway = false
    @State private var leaving = false

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            FlowerView(state: .bloom, color: .pink, radius: 30, stem: 46)
                .scaleEffect(grown ? 1 : 0.15, anchor: .bottom)
                .opacity(grown ? 1 : 0)
                .rotationEffect(.degrees(reduceMotion ? 0 : (sway ? 5 : -3)), anchor: .bottom)
                .offset(y: 20)
        }
        .opacity(leaving ? 0 : 1)
        .allowsHitTesting(!leaving)
        .accessibilityHidden(true)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.5), trigger: grown)
        .task {
            try? await Task.sleep(for: .milliseconds(80))
            withAnimation(reduceMotion ? .easeOut(duration: 0.25) : .spring(response: 0.5, dampingFraction: 0.62)) { grown = true }
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 0.55).delay(0.25)) { sway = true }
            }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 450 : 950))
            withAnimation(.easeOut(duration: 0.3)) { leaving = true }
            try? await Task.sleep(for: .milliseconds(320))
            onFinish()
        }
    }
}
