import SwiftUI
import UIKit

struct CheckInAvatar: View {
    var person: WirePerson
    var radius: CGFloat = 22
    var ring: Bool = true

    var body: some View {
        ZStack {
            Circle()
                .fill(person.flower.petal)
            if let photo = person.photoUrl, let url = URL(string: photo) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Text(String(person.name.prefix(1)).uppercased())
                        .font(.system(size: radius * 0.8, weight: .heavy, design: .rounded))
                        .foregroundStyle(person.flower.deep)
                }
            } else {
                Text(String(person.name.prefix(1)).uppercased())
                    .font(.system(size: radius * 0.8, weight: .heavy, design: .rounded))
                    .foregroundStyle(person.flower.deep)
            }
        }
        .frame(width: radius * 2, height: radius * 2)
        .clipShape(Circle())
        .overlay(Circle().stroke(FrolicColor.paper, lineWidth: ring ? 2 : 0))
        .accessibilityHidden(true)
    }
}

struct SentShotAvatar: View {
    var name: String
    var flower: FlowerColor
    var radius: CGFloat = 11

    var body: some View {
        Circle()
            .fill(flower.petal)
            .frame(width: radius * 2, height: radius * 2)
            .overlay(
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: radius, weight: .heavy, design: .rounded))
                    .foregroundStyle(flower.deep)
            )
            .accessibilityHidden(true)
    }
}

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
