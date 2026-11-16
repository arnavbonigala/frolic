import SwiftUI

struct LaunchBloom: View {
    var onFinish: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var written: CGFloat = 0
    @State private var dotLanded = false
    @State private var bloomed = false
    @State private var leaving = false
    private let width: CGFloat = 210

    var body: some View {
        let box = Wordmark.viewBox
        let scale = width / box.width
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            ZStack(alignment: .topLeading) {
                WordmarkStrokes()
                    .trim(from: 0, to: written)
                    .stroke(FrolicColor.ink, style: StrokeStyle(lineWidth: 20 * scale, lineCap: .round, lineJoin: .round))
                ZStack {
                    ForEach(0..<6, id: \.self) { index in
                        Capsule()
                            .fill(index.isMultiple(of: 2) ? FlowerColor.pink.petal : FlowerColor.pink.deep)
                            .frame(width: 18 * scale, height: 27 * scale)
                            .offset(y: -18 * scale)
                            .rotationEffect(.degrees(Double(index) * 60))
                            .scaleEffect(bloomed ? 1 : 0.05)
                            .animation(.spring(response: 0.42, dampingFraction: 0.55).delay(Double(index) * 0.035), value: bloomed)
                    }
                    Circle()
                        .fill(FrolicColor.sun)
                        .frame(width: 23 * scale, height: 23 * scale)
                }
                .rotationEffect(.degrees(bloomed ? 0 : -40))
                .frame(width: 23 * scale, height: 23 * scale)
                .offset(
                        x: (228 - 11.5 - box.minX) * scale,
                        y: (14 - 11.5 - box.minY) * scale + (dotLanded ? 0 : -90)
                    )
                    .opacity(dotLanded ? 1 : 0)
            }
            .frame(width: width, height: width * box.height / box.width)
        }
        .opacity(leaving ? 0 : 1)
        .allowsHitTesting(!leaving)
        .accessibilityHidden(true)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.55), trigger: dotLanded)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.35), trigger: bloomed)
        .task {
            if reduceMotion {
                written = 1
                dotLanded = true
                bloomed = true
                try? await Task.sleep(for: .milliseconds(450))
            } else {
                try? await Task.sleep(for: .milliseconds(60))
                withAnimation(.easeInOut(duration: 0.8)) { written = 1 }
                try? await Task.sleep(for: .milliseconds(720))
                withAnimation(.spring(response: 0.38, dampingFraction: 0.48)) { dotLanded = true }
                try? await Task.sleep(for: .milliseconds(300))
                withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) { bloomed = true }
                try? await Task.sleep(for: .milliseconds(700))
            }
            withAnimation(.easeOut(duration: 0.3)) { leaving = true }
            try? await Task.sleep(for: .milliseconds(320))
            onFinish()
        }
    }
}
