import Foundation
import Photos
import UIKit

struct TastePhoto: Identifiable, Equatable {
    var id: String
    var label: String
    var assetIdentifier: String?
    var demoName: String?
    var tags: [TasteTag]
    var image: UIImage?

    static func == (lhs: TastePhoto, rhs: TastePhoto) -> Bool { lhs.id == rhs.id }
}

enum TasteLibrary {
    enum Access: Equatable {
        case authorized
        case limited
        case denied
        case undetermined
    }

    static let photoUsageKey = "NSPhotoLibraryUsageDescription"
    static let recentLimit = 60

    static var isPackaged: Bool { Bundle.main.object(forInfoDictionaryKey: photoUsageKey) != nil }

    static var access: Access {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized: .authorized
        case .limited: .limited
        case .denied, .restricted: .denied
        case .notDetermined: .undetermined
        @unknown default: .denied
        }
    }

    static func requestAccess() async -> Access {
        guard isPackaged else { return .denied }
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        switch status {
        case .authorized: return .authorized
        case .limited: return .limited
        case .denied, .restricted: return .denied
        case .notDetermined: return .undetermined
        @unknown default: return .denied
        }
    }

    static func recent() async -> [TastePhoto] {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = recentLimit
        let assets = PHAsset.fetchAssets(with: .image, options: options)
        var photos: [TastePhoto] = []
        assets.enumerateObjects { asset, index, _ in
            photos.append(TastePhoto(
                id: asset.localIdentifier,
                label: "Photo \(index + 1)",
                assetIdentifier: asset.localIdentifier,
                demoName: nil,
                tags: [],
                image: nil
            ))
        }
        return photos
    }

    static func image(for photo: TastePhoto, size: CGFloat = 320) async -> UIImage? {
        if let demoName = photo.demoName {
            return UIImage(named: demoName)
        }
        guard let identifier = photo.assetIdentifier,
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject
        else { return nil }
        return await withCheckedContinuation { continuation in
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .fast
            options.isNetworkAccessAllowed = false
            PHImageManager.default().requestImage(
                for: asset,
                targetSize: CGSize(width: size, height: size),
                contentMode: .aspectFill,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
    }

    static func data(for photo: TastePhoto) async -> Data? {
        if let image = await image(for: photo, size: 640) {
            return image.jpegData(compressionQuality: 0.7)
        }
        if let demoName = photo.demoName {
            return UIImage(named: demoName)?.jpegData(compressionQuality: 0.7)
        }
        return nil
    }

    static var demoPhotos: [TastePhoto] {
        let entries: [(String, String, String, TasteTag)] = [
            ("taste-pizza", "Pizza night", "taste-pizza.jpg", .lateNightFood),
            ("taste-sunset", "Sunset", "taste-sunset.jpg", .sunsets),
            ("taste-bowling", "Bowling", "taste-bowling.jpg", .games),
            ("taste-picnic", "Picnic", "taste-picnic.jpg", .outdoors),
            ("taste-marina", "The Marina", "taste-marina.jpg", .sunsets),
            ("taste-beach", "Beach day", "taste-beach.jpg", .outdoors),
            ("taste-campus", "Campus", "taste-campus.jpg", .freeStuff),
            ("taste-climbing", "Climbing", "taste-climbing.jpg", .outdoors),
            ("taste-pier", "Pier", "taste-pier.jpg", .freeStuff),
        ]
        return entries.map { id, label, file, tag in
            TastePhoto(
                id: id,
                label: label,
                assetIdentifier: nil,
                demoName: file,
                tags: [tag],
                image: UIImage(named: file)
            )
        }
    }

    static var photoSheetDemo: [TastePhoto] {
        let entries: [(String, String, String)] = [
            ("photo-selfie", "Selfie", "photo-selfie.jpg"),
            ("photo-1", "Photo 1", "photo-1.jpg"),
            ("photo-2", "Photo 2", "photo-2.jpg"),
            ("photo-3", "Photo 3", "photo-3.jpg"),
        ]
        return entries.map { id, label, file in
            TastePhoto(
                id: id,
                label: label,
                assetIdentifier: nil,
                demoName: file,
                tags: [],
                image: UIImage(named: file)
            )
        }
    }
}
