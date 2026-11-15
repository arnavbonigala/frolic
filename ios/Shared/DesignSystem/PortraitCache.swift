import CryptoKit
import ImageIO
import SwiftUI
import UIKit

struct PortraitRef: Hashable, Sendable {
    var id: String
    var url: URL
}

final class PortraitCache: @unchecked Sendable {
    static let shared = PortraitCache()

    static let avatarSizes: [CGFloat] = [14, 20, 22, 24, 26, 28, 32, 46]

    private final class Entry: NSObject {
        let image: UIImage
        let source: String

        init(image: UIImage, source: String) {
            self.image = image
            self.source = source
        }
    }

    private let faces = NSCache<NSString, Entry>()
    private let directory: URL
    private let lock = NSLock()
    private var inFlight: [String: Task<Data?, Never>] = [:]

    private init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent("portraits", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        faces.countLimit = 240
    }

    static func key(_ id: String, _ size: CGFloat) -> String {
        "\(id)#\(Int(size.rounded()))"
    }

    private static func pixels(_ size: CGFloat) -> CGFloat {
        max(size.rounded(), 1) * 3
    }

    private func file(for url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest)
    }

    func face(id: String, url: URL, size: CGFloat) -> UIImage? {
        let key = Self.key(id, size) as NSString
        guard let entry = faces.object(forKey: key) else { return nil }
        guard entry.source == url.absoluteString else {
            faces.removeObject(forKey: key)
            return nil
        }
        return entry.image
    }

    @discardableResult
    func load(id: String, url: URL, size: CGFloat) async -> UIImage? {
        if let ready = face(id: id, url: url, size: size) { return ready }
        guard let data = await bytes(url) else { return nil }
        if let image = Self.thumbnail(data, pixels: Self.pixels(size)) {
            store(image, id: id, url: url, size: size)
        }
        hydrate(data, id: id, url: url)
        return face(id: id, url: url, size: size)
    }

    func warm(_ refs: [PortraitRef]) async {
        await withTaskGroup(of: Void.self) { group in
            for ref in refs where !isWarm(ref) {
                group.addTask { await self.warm(ref) }
            }
        }
    }

    private func warm(_ ref: PortraitRef) async {
        guard let data = await bytes(ref.url) else { return }
        hydrate(data, id: ref.id, url: ref.url)
    }

    private func isWarm(_ ref: PortraitRef) -> Bool {
        Self.avatarSizes.allSatisfy { face(id: ref.id, url: ref.url, size: $0) != nil }
    }

    private func hydrate(_ data: Data, id: String, url: URL) {
        for size in Self.avatarSizes {
            guard face(id: id, url: url, size: size) == nil else { continue }
            if let image = Self.thumbnail(data, pixels: Self.pixels(size)) {
                store(image, id: id, url: url, size: size)
            }
        }
    }

    private func store(_ image: UIImage, id: String, url: URL, size: CGFloat) {
        faces.setObject(Entry(image: image, source: url.absoluteString), forKey: Self.key(id, size) as NSString)
    }

    private func bytes(_ url: URL) async -> Data? {
        let key = url.absoluteString
        let task = lock.withLock { () -> Task<Data?, Never> in
            if let existing = inFlight[key] { return existing }
            let task = Task<Data?, Never> {
                let data = await self.fetch(url)
                self.lock.withLock { self.inFlight[key] = nil }
                return data
            }
            inFlight[key] = task
            return task
        }
        return await task.value
    }

    private func fetch(_ url: URL) async -> Data? {
        if let data = try? Data(contentsOf: file(for: url)) { return data }
        guard let (data, response) = try? await URLSession.shared.data(from: url) else { return nil }
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { return nil }
        try? data.write(to: file(for: url), options: .atomic)
        return data
    }

    private static func thumbnail(_ data: Data, pixels: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: pixels,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

struct PortraitView: View {
    var id: String
    var url: URL
    var size: CGFloat
    var tint: FlowerColor

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var image: UIImage?

    init(id: String, url: URL, size: CGFloat, tint: FlowerColor) {
        self.id = id
        self.url = url
        self.size = size
        self.tint = tint
        _image = State(initialValue: PortraitCache.shared.face(id: id, url: url, size: size))
    }

    var body: some View {
        ZStack {
            PortraitBloom(tint: tint)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .task(id: url) {
            guard image == nil, let loaded = await PortraitCache.shared.load(id: id, url: url, size: size) else { return }
            if reduceMotion {
                image = loaded
            } else {
                withAnimation(.easeOut(duration: 0.18)) { image = loaded }
            }
        }
        .accessibilityHidden(true)
    }
}

struct PortraitBloom: View {
    var tint: FlowerColor

    var body: some View {
        Circle()
            .fill(
                LinearGradient(
                    colors: [tint.petal.opacity(0.55), tint.deep.opacity(0.4)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay(Circle().strokeBorder(FrolicColor.cream.opacity(0.6), lineWidth: 1))
    }
}
