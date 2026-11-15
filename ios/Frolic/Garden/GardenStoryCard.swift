import SwiftUI
import LinkPresentation
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
        UIActivityViewController(activityItems: [StoryImageItem(image: image, title: title)], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

final class StoryImageItem: NSObject, UIActivityItemSource {
    let image: UIImage
    let title: String

    init(image: UIImage, title: String) {
        self.image = image
        self.title = title
    }

    func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { image }

    func activityViewController(_ controller: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { image }

    func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.title = title
        metadata.imageProvider = NSItemProvider(object: image)
        metadata.iconProvider = NSItemProvider(object: image)
        return metadata
    }
}

struct GardenStoryCard: View {
    var groupName: String
    var countLine: String
    var line: String
    var detail: String?
    var people: [GardenPerson]
    var hero: String? = nil
    var photo: UIImage? = nil
    var width: CGFloat = 220
    var cornerRadius: CGFloat = 22

    private var scale: CGFloat { width / 220 }
    private var height: CGFloat { width * 16 / 9 }
    private let night = Color(hex: 0x12162A)
    private let cream = Color(hex: 0xF6EBDD)
    private let stems: [CGFloat] = [40, 62, 34, 56, 46]

    var body: some View {
        ZStack(alignment: .top) {
            night
            painting
                .frame(width: width, height: height * 0.64)
                .clipped()
                .mask(
                    LinearGradient(stops: [.init(color: .black, location: 0.72), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom)
                )
            if let photo {
                Image(uiImage: photo)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 150 * scale, height: 170 * scale)
                    .clipped()
                    .padding(7 * scale)
                    .padding(.bottom, 22 * scale)
                    .background(Color.white)
                    .shadow(color: .black.opacity(0.35), radius: 10 * scale, y: 6 * scale)
                    .rotationEffect(.degrees(-4))
                    .padding(.top, 38 * scale)
            }
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: -6 * scale) {
                    ForEach(Array(people.prefix(6).enumerated()), id: \.element.id) { index, person in
                        GardenFlower(person: person, color: person.color, radius: 17 * scale, stem: stems[index % stems.count] * scale, swayDelay: 0)
                    }
                }
                .padding(.bottom, 14 * scale)
                VStack(spacing: 6 * scale) {
                    Text(groupName)
                        .font(.system(size: 11 * scale, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(hex: 0x8EE3A8))
                    Text(line)
                        .font(.system(size: 25 * scale, weight: .heavy, design: .serif))
                        .foregroundStyle(cream)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                        .minimumScaleFactor(0.7)
                    Text(countLine)
                        .font(.system(size: 11 * scale, weight: .medium, design: .rounded))
                        .foregroundStyle(cream.opacity(0.72))
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 18 * scale)
                Wordmark(color: cream, width: 50 * scale)
                    .padding(.top, 18 * scale)
                    .padding(.bottom, 22 * scale)
            }
            .frame(width: width, height: height)
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius * scale, style: .continuous))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(groupName). \(line). \(countLine)")
    }

    @ViewBuilder
    private var painting: some View {
        if let name = hero ?? PlanPainted.hero(for: line), let image = UIImage(named: name) {
            Image(uiImage: image).resizable().scaledToFill()
        } else if let image = UIImage(named: "plan-outdoors") {
            Image(uiImage: image).resizable().scaledToFill()
        }
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
