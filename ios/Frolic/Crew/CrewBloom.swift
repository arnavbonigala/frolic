import SwiftUI
import UIKit

struct CrewBloom: View {
    var row: CrewRow
    var radius: CGFloat = 22
    var stem: CGFloat = 0
    var animates = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var swayed = false

    private var width: CGFloat { radius * 2 + 8 }
    private var height: CGFloat { radius * 2 + stem + 4 }
    private var sways: Bool { animates && !row.isFolded && !reduceMotion }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Canvas { context, _ in drawBloom(in: &context) }
            face
                .position(x: width / 2, y: radius + 4)
        }
        .frame(width: width, height: height)
        .rotationEffect(.degrees(sways ? (swayed ? 3 : -3) : 0), anchor: .bottom)
        .saturation(row.isFolded ? 0.25 : 1)
        .opacity(row.isFolded ? 0.6 : 1)
        .onAppear {
            guard sways else { return }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                swayed = true
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var face: some View {
        ZStack {
            if let urlString = row.photoURL, let url = URL(string: urlString) {
                AsyncImage(url: url, transaction: Transaction(animation: .easeInOut(duration: 0.2))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initial
                    }
                }
            } else if let asset = row.photoAsset, UIImage(named: asset) != nil {
                Image(asset).resizable().scaledToFill()
            } else {
                initial
            }
        }
        .frame(width: radius, height: radius)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(FrolicColor.cream, lineWidth: 2))
        .background(
            Circle()
                .fill(FrolicColor.cream)
                .frame(width: radius + 6, height: radius + 6)
        )
        .overlay {
            if row.lookingNow {
                Circle()
                    .strokeBorder(FrolicColor.free.opacity(0.9), lineWidth: 2)
                    .frame(width: radius + 8, height: radius + 8)
            }
        }
    }

    private var initial: some View {
        ZStack {
            FrolicColor.cream
            Text(String(row.name.prefix(1)).uppercased())
                .font(.system(size: radius * 0.5, weight: .heavy, design: .rounded))
                .foregroundStyle(row.color.deep)
        }
    }

    private func drawBloom(in context: inout GraphicsContext) {
        let cx = width / 2
        let cy = radius + 4
        if stem > 0 {
            var stalk = Path()
            stalk.move(to: CGPoint(x: cx, y: cy + radius * 0.4))
            stalk.addCurve(
                to: CGPoint(x: cx, y: height),
                control1: CGPoint(x: cx - 3, y: cy + radius * 0.4 + stem * 0.4),
                control2: CGPoint(x: cx + 4, y: cy + radius * 0.4 + stem * 0.7)
            )
            context.stroke(stalk, with: .color(FrolicColor.stem), style: StrokeStyle(lineWidth: 4, lineCap: .round))
        }
        for layer in 0..<2 {
            let color = layer == 0 ? row.color.deep : row.color.petal
            let rx = radius * (layer == 0 ? 0.34 : 0.3)
            let ry = radius * (layer == 0 ? 0.5 : 0.46)
            let lift = radius * (layer == 0 ? 0.56 : 0.58)
            let start = layer == 0 ? 22.5 : 0
            for i in 0..<8 {
                var petal = context
                petal.translateBy(x: cx, y: cy)
                petal.rotate(by: .degrees(Double(i) * 45 + start))
                petal.fill(
                    Path(ellipseIn: CGRect(x: -rx, y: -lift - ry, width: rx * 2, height: ry * 2)),
                    with: .color(color)
                )
            }
        }
    }
}

struct CrewPainted: View {
    var name: String
    var size: CGFloat
    var fallbackSymbol: String
    var fallbackTint: Color = FrolicColor.bandText

    var body: some View {
        Group {
            if UIImage(named: name) != nil {
                Image(name)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: fallbackSymbol)
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(fallbackTint)
                    .frame(width: size, height: size)
                    .background(Circle().fill(FrolicColor.paper.opacity(0.9)))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
