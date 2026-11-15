import CoreGraphics
import Foundation
import ImageIO
import Vision

enum PhotoTagging {
    static func tags(for data: Data) async -> [TasteTag] {
        await Task.detached(priority: .userInitiated) { analyse(data) }.value
    }

    private static func analyse(_ data: Data) -> [TasteTag] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceThumbnailMaxPixelSize: 640,
              ] as CFDictionary)
        else { return [] }
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        let classify = VNClassifyImageRequest()
        let faces = VNDetectFaceRectanglesRequest()
        try? handler.perform([classify, faces])
        var found: [TasteTag] = []
        for observation in (classify.results ?? []).prefix(10) where observation.confidence >= 0.18 {
            guard let tag = TasteTag.from(classifier: observation.identifier) else { continue }
            if !found.contains(tag) { found.append(tag) }
        }
        if found.isEmpty, let count = faces.results?.count, count >= 2 {
            found = [.outdoors]
        }
        return found
    }
}
