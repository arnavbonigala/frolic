import SwiftUI
import UIKit

struct GardenSharePayload: Identifiable {
    let id = UUID()
    var image: UIImage
    var title: String
}

struct GardenShareSheet: UIViewControllerRepresentable {
    var image: UIImage
    var title: String

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [image, title], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct GardenStoryCard: View {
    var groupName: String
    var countLine: String
    var line: String
    var detail: String?
    var people: [GardenPerson]
    var width: CGFloat = 220
    var cornerRadius: CGFloat = 22

    private var scale: CGFloat { width / 220 }

    private var eyebrow: String { "\(groupName.uppercased()) · \(countLine.uppercased())" }

    private let stems: [CGFloat] = [56, 84, 46, 76, 62]

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                stops: [
                    .init(color: FrolicColor.skyTop, location: 0),
                    .init(color: FrolicColor.cream, location: 0.6),
                    .init(color: FrolicColor.meadowDeep, location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(spacing: 0) {
                Wordmark(width: 70 * scale)
                    .padding(.top, 18 * scale)
                HStack(alignment: .bottom, spacing: -8 * scale) {
                    ForEach(Array(people.enumerated()), id: \.element.id) { index, person in
                        GardenFlower(
                            person: person,
                            color: person.color,
                            radius: 24 * scale,
                            stem: stems[index % stems.count] * scale,
                            swayDelay: Double(index) * 0.6
                        )
                    }
                }
                .padding(.top, 10 * scale)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
            VStack(alignment: .leading, spacing: 4 * scale) {
                Text(eyebrow)
                    .font(.system(size: 12 * scale, weight: .semibold))
                    .foregroundStyle(FrolicColor.secondaryText)
                Text(line)
                    .font(.system(size: 22 * scale, weight: .heavy, design: .rounded))
                    .tracking(-0.3 * scale)
                    .foregroundStyle(FrolicColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 13 * scale, weight: .regular))
                        .foregroundStyle(FrolicColor.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16 * scale)
            .padding(.bottom, 22 * scale)
        }
        .frame(width: width, height: width * 16 / 9)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius * scale, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(eyebrow). \(line)")
    }
}

@MainActor
enum GardenStoryRenderer {
    static let storiesSize = CGSize(width: 1080, height: 1920)

    static func image(card: GardenStoryCard) -> UIImage? {
        var export = card
        export.width = storiesSize.width
        export.cornerRadius = 0
        let renderer = ImageRenderer(content: export)
        renderer.scale = 1
        renderer.isOpaque = true
        renderer.proposedSize = ProposedViewSize(width: storiesSize.width, height: storiesSize.height)
        return renderer.uiImage
    }
}
