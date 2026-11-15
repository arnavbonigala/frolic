import UIKit

enum HeroCache {
    static let names = HeroKey.all + ["state-waiting", "state-its-on", "state-faded", "state-solo", "launch-meadow"]

    static func export() async {
        guard let dir = LockScreenStore.heroDirectory else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for name in names {
            let file = dir.appending(path: "\(name).png")
            if FileManager.default.fileExists(atPath: file.path(percentEncoded: false)) { continue }
            guard let image = UIImage(named: name) else { continue }
            let scale = min(1, 480 / max(image.size.width, 1))
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            guard let small = await image.byPreparingThumbnail(ofSize: size), let png = small.pngData() else { continue }
            try? png.write(to: file)
        }
    }
}
