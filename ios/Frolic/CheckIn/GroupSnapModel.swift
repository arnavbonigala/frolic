import Combine
import ConvexMobile
import Foundation
import UIKit

@MainActor
@Observable
final class GroupSnapModel {
    enum Stage: Equatable {
        case ready
        case counting
        case capturing
        case uploading
        case failed(String)
        case done
    }

    var stage: Stage = .ready
    var numeral = 3
    var fireDeltaMs: Int?
    var camera = SnapCamera()
    var photo: UIImage?
    var windowSnapAt: Double?

    private var task: Task<Void, Never>?

    var isBusy: Bool {
        switch stage {
        case .counting, .capturing, .uploading: true
        default: false
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
        camera.stop()
    }

    func run(
        client: ConvexClient,
        token: String,
        frolicId: String,
        clockOffset: Double,
        takenOverride: UIImage?,
        completion: @escaping (UIImage) -> Void
    ) {
        task?.cancel()
        task = Task { [weak self] in
            guard let self else { return }
            do {
                let snapAt: Double = try await client.mutation(
                    "snaps:start",
                    with: ["deviceToken": token, "frolicId": frolicId]
                )
                self.windowSnapAt = snapAt
                self.stage = .counting
                let target = Date(timeIntervalSince1970: (snapAt - clockOffset) / 1000)
                while Date() < target {
                    self.numeral = max(1, Int(ceil(target.timeIntervalSinceNow)))
                    try await Task.sleep(nanoseconds: 40_000_000)
                }
                self.numeral = 0
                self.fireDeltaMs = Int(Date().timeIntervalSince1970 * 1000 - (snapAt - clockOffset))
                self.stage = .capturing
                let image = takenOverride ?? (await self.camera.capture())
                guard let image else {
                    self.stage = .failed("The camera didn't come through. Try again.")
                    return
                }
                self.photo = image
                self.stage = .uploading
                try await self.upload(
                    image,
                    client: client,
                    token: token,
                    frolicId: frolicId,
                    takenAt: Date().timeIntervalSince1970 * 1000 + clockOffset
                )
                self.stage = .done
                self.camera.stop()
                completion(image)
            } catch {
                self.stage = .failed(checkInMessage(error))
            }
        }
    }

    private func upload(
        _ image: UIImage,
        client: ConvexClient,
        token: String,
        frolicId: String,
        takenAt: Double
    ) async throws {
        guard let data = image.jpegData(compressionQuality: 0.86) else {
            throw CheckInFailure.message("That photo couldn't be prepared. Try again.")
        }
        let raw: String = try await client.mutation("users:generateUploadUrl", with: ["deviceToken": token])
        guard let url = URL(string: raw) else {
            throw CheckInFailure.message("That photo couldn't be uploaded. Try again.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        let (body, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw CheckInFailure.message("That photo couldn't be uploaded. Try again.")
        }
        struct UploadResult: Decodable { let storageId: String }
        let result = try JSONDecoder().decode(UploadResult.self, from: body)
        let _: String? = try await client.mutation(
            "snaps:addMine",
            with: [
                "deviceToken": token,
                "frolicId": frolicId,
                "storageId": result.storageId,
                "takenAt": takenAt,
            ]
        )
    }
}
