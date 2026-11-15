import SwiftUI

struct Wordmark: View {
    var color: Color = FrolicColor.ink
    var width: CGFloat = 92
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var risen = false

    private static let viewBox = CGRect(x: -12, y: -14, width: 330, height: 128)

    var body: some View {
        Canvas { context, size in
            let scale = size.width / Self.viewBox.width
            context.scaleBy(x: scale, y: scale)
            context.translateBy(x: -Self.viewBox.minX, y: -Self.viewBox.minY)
            context.stroke(
                Self.letters,
                with: .color(color),
                style: StrokeStyle(lineWidth: 20, lineCap: .round, lineJoin: .round)
            )
        }
        .overlay(alignment: .topLeading) {
            let scale = width / Self.viewBox.width
            Circle()
                .fill(FrolicColor.sun)
                .frame(width: 23 * scale, height: 23 * scale)
                .scaleEffect(risen ? 1.08 : 1)
                .offset(
                    x: (228 - 11.5 - Self.viewBox.minX) * scale,
                    y: (14 - 11.5 - Self.viewBox.minY) * scale + (risen ? -4 : 2) * scale
                )
        }
        .frame(width: width, height: width * Self.viewBox.height / Self.viewBox.width)
        .accessibilityElement()
        .accessibilityLabel("Frolic")
        .accessibilityAddTraits(.isHeader)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
                risen = true
            }
        }
    }

    private static let letters: Path = {
        var p = Path()
        p.move(to: CGPoint(x: 14, y: 100))
        p.addLine(to: CGPoint(x: 14, y: 34))
        p.addCurve(to: CGPoint(x: 46, y: 6), control1: CGPoint(x: 14, y: 14), control2: CGPoint(x: 26, y: 4))
        p.move(to: CGPoint(x: 0, y: 48))
        p.addLine(to: CGPoint(x: 60, y: 48))
        p.move(to: CGPoint(x: 60, y: 48))
        p.addLine(to: CGPoint(x: 60, y: 100))
        p.move(to: CGPoint(x: 60, y: 72))
        p.addCurve(to: CGPoint(x: 92, y: 49), control1: CGPoint(x: 62, y: 56), control2: CGPoint(x: 74, y: 48))
        p.addEllipse(in: CGRect(x: 112, y: 48, width: 52, height: 52))
        p.move(to: CGPoint(x: 190, y: 6))
        p.addLine(to: CGPoint(x: 190, y: 78))
        p.addCurve(to: CGPoint(x: 210, y: 102), control1: CGPoint(x: 190, y: 94), control2: CGPoint(x: 198, y: 102))
        p.addCurve(to: CGPoint(x: 228, y: 82), control1: CGPoint(x: 222, y: 102), control2: CGPoint(x: 228, y: 94))
        p.addLine(to: CGPoint(x: 228, y: 50))
        p.move(to: CGPoint(x: 300, y: 58))
        p.addCurve(to: CGPoint(x: 279, y: 48), control1: CGPoint(x: 294, y: 51), control2: CGPoint(x: 287, y: 48))
        p.addCurve(to: CGPoint(x: 253, y: 75), control1: CGPoint(x: 264, y: 48), control2: CGPoint(x: 253, y: 60))
        p.addCurve(to: CGPoint(x: 279, y: 101), control1: CGPoint(x: 253, y: 90), control2: CGPoint(x: 264, y: 101))
        p.addCurve(to: CGPoint(x: 300, y: 91), control1: CGPoint(x: 287, y: 101), control2: CGPoint(x: 294, y: 98))
        return p
    }()
}
