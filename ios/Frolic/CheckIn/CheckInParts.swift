import SwiftUI
import UIKit

struct HeroBand: View {
    var imageName: String?
    var fallback: FlowerColor

    var body: some View {
        ZStack {
            if let imageName, UIImage(named: imageName) != nil {
                Image(imageName)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 200)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .accessibilityHidden(true)
            } else {
                LinearGradient(
                    colors: [fallback.petal.opacity(0.85), FrolicColor.cream],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 200)
                .overlay(
                    Image(systemName: "sun.horizon.fill")
                        .font(.system(size: 54, weight: .bold))
                        .foregroundStyle(FrolicColor.paper.opacity(0.85))
                        .accessibilityHidden(true)
                )
            }
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.25), location: 0),
                    .init(color: .black.opacity(0), location: 0.3),
                    .init(color: FrolicColor.cream.opacity(0), location: 0.6),
                    .init(color: FrolicColor.cream, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .frame(height: 200)
        .clipped()
    }
}

struct RouteBar: View {
    var progress: Double
    var tint: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(FrolicColor.chip)
                Capsule()
                    .fill(tint)
                    .frame(width: max(14, proxy.size.width * progress))
                    .overlay(alignment: .trailing) {
                        Circle()
                            .fill(tint)
                            .frame(width: 12, height: 12)
                            .overlay(Circle().stroke(FrolicColor.paper, lineWidth: 3))
                            .offset(x: 5)
                    }
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}
