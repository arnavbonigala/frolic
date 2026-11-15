import SwiftUI
import UIKit

final class GardenImageCache: @unchecked Sendable {
    static let shared = GardenImageCache()

    private let images = NSCache<NSString, UIImage>()
    private let session: URLSession

    private init() {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(memoryCapacity: 24_000_000, diskCapacity: 160_000_000, diskPath: "frolic-garden")
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        session = URLSession(configuration: configuration)
        images.countLimit = 120
    }

    func image(for urlString: String, pixels: CGSize) async -> UIImage? {
        let key = "\(urlString)#\(Int(pixels.width))x\(Int(pixels.height))" as NSString
        if let hit = images.object(forKey: key) { return hit }
        guard let url = URL(string: urlString) else { return nil }
        do {
            let (data, response) = try await session.data(from: url)
            if let code = (response as? HTTPURLResponse)?.statusCode, code >= 400 { return nil }
            guard let image = Self.downsample(data, to: pixels) else { return nil }
            images.setObject(image, forKey: key)
            return image
        } catch {
            return nil
        }
    }

    private static func downsample(_ data: Data, to pixels: CGSize) -> UIImage? {
        guard pixels.width > 0, pixels.height > 0 else { return nil }
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(pixels.width, pixels.height),
        ] as CFDictionary
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
        return UIImage(cgImage: thumbnail)
    }
}

struct GardenRemoteImage: View {
    var url: String
    var heroKey: String?
    @Environment(\.displayScale) private var displayScale
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    GardenArtwork(key: failed ? heroKey : nil, seed: url)
                        .opacity(failed ? 1 : 0.4)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .clipped()
            .task(id: url) {
                await load(size: proxy.size)
            }
        }
        .accessibilityHidden(true)
    }

    private func load(size: CGSize) async {
        guard !url.isEmpty, size.width > 0, size.height > 0 else {
            failed = true
            return
        }
        let pixels = CGSize(width: size.width * displayScale, height: size.height * displayScale)
        if let loaded = await GardenImageCache.shared.image(for: url, pixels: pixels) {
            image = loaded
        } else {
            failed = true
        }
    }
}

struct GardenArtwork: View {
    var key: String?
    var seed: String = ""

    private var palette: [FlowerColor] {
        let all = FlowerColor.allCases
        guard !all.isEmpty else { return [] }
        let base = seed.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return (0..<3).map { all[(base + $0 * 2) % all.count] }
    }

    var body: some View {
        if let key, UIImage(named: key) != nil {
            Image(key)
                .resizable()
                .scaledToFill()
        } else {
            drawn
        }
    }

    private var drawn: some View {
        ZStack {
            LinearGradient(
                colors: [FrolicColor.skyTop, FrolicColor.skyMid, FrolicColor.meadow, FrolicColor.meadowDeep],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(spacing: 0) {
                Circle()
                    .fill(FrolicColor.sun.opacity(0.85))
                    .frame(width: 34, height: 34)
                    .padding(.top, 14)
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: -4) {
                    ForEach(Array(palette.enumerated()), id: \.offset) { index, color in
                        FlowerView(color: color, radius: 11, stem: [20, 32, 24][index % 3], swayDelay: Double(index) * 0.5)
                    }
                }
                .padding(.bottom, 6)
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}

struct GardenFlower: View {
    var person: GardenPerson?
    var color: FlowerColor
    var radius: CGFloat
    var stem: CGFloat = 0
    var state: FlowerState = .bloom
    var showsName = false
    var swayDelay: Double = 0

    private var tint: FlowerColor { person?.color ?? color }

    var body: some View {
        FlowerView(
            state: state,
            person: person?.flower,
            color: tint,
            radius: radius,
            stem: stem,
            showsName: showsName,
            status: nil,
            swayDelay: swayDelay
        )
        .overlay(alignment: .top) {
            if let url = person?.photoUrl, !url.isEmpty {
                GardenRemoteImage(url: url, heroKey: nil)
                    .frame(width: radius, height: radius)
                    .clipShape(Circle())
                    .padding(.top, radius / 2 + 4)
            }
        }
    }
}
