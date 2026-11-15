import CryptoKit
import SwiftUI
import UIKit

final class PortraitCache: @unchecked Sendable {
    static let shared = PortraitCache()

    private let memory = NSCache<NSURL, UIImage>()
    private let directory: URL

    private init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        directory = base.appendingPathComponent("portraits", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func file(for url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest)
    }

    func cached(_ url: URL) -> UIImage? {
        if let image = memory.object(forKey: url as NSURL) { return image }
        guard let data = try? Data(contentsOf: file(for: url)), let image = UIImage(data: data) else { return nil }
        memory.setObject(image, forKey: url as NSURL)
        return image
    }

    @discardableResult
    func load(_ url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        guard let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data) else { return nil }
        memory.setObject(image, forKey: url as NSURL)
        try? data.write(to: file(for: url), options: .atomic)
        return image
    }
}

struct CachedPortrait<Placeholder: View>: View {
    var url: URL
    @ViewBuilder var placeholder: () -> Placeholder
    @State private var image: UIImage?

    init(url: URL, @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.url = url
        self.placeholder = placeholder
        _image = State(initialValue: PortraitCache.shared.cached(url))
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            if image == nil { image = await PortraitCache.shared.load(url) }
        }
    }
}
