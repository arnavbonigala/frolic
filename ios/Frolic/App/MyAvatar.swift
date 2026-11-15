import SwiftUI
import UIKit

@MainActor
@Observable
final class MyAvatar {
    static let shared = MyAvatar()
    private(set) var image: UIImage?
    private var loaded: String?

    func load(_ raw: String?) async {
        guard let raw, raw != loaded else { return }
        loaded = raw
        var source: UIImage?
        if let asset = TodayMedia.portraitAsset(raw) {
            source = UIImage(named: asset)
        } else if let url = TodayMedia.url(raw), let (data, _) = try? await URLSession.shared.data(from: url) {
            source = UIImage(data: data)
        }
        guard let source else { return }
        image = Self.badge(source)
    }

    private static func badge(_ source: UIImage) -> UIImage {
        let side: CGFloat = 28
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side))
        let rendered = renderer.image { _ in
            let rect = CGRect(x: 0, y: 0, width: side, height: side)
            UIBezierPath(ovalIn: rect).addClip()
            let scale = max(side / source.size.width, side / source.size.height)
            let size = CGSize(width: source.size.width * scale, height: source.size.height * scale)
            source.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
        }
        return rendered.withRenderingMode(.alwaysOriginal)
    }
}
