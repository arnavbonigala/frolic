import ConvexMobile
import Foundation
import QuartzCore
import UIKit

@MainActor
@Observable
final class GroupSnapModel {
    enum Stage: Equatable {
        case ready
        case starting
        case counting
        case uploading
        case failed(String)
        case done
    }

    var stage: Stage = .ready
    var numeral = 3
    var fireDeltaMs: Double?
    var flash = false
    let camera = SnapCamera()
    var photo: UIImage?
    var libraryShot: UIImage?

    private var armedSnapAt: Double?
    private var task: Task<Void, Never>?

    var isBusy: Bool {
        switch stage {
        case .starting, .counting, .uploading: true
        default: false
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
        armedSnapAt = nil
        if stage != .done { stage = .ready }
    }

    func reset() {
        cancel()
        stage = .ready
        photo = nil
        fireDeltaMs = nil
    }

    func start(client: ConvexClient, token: String, frolicId: String, clockOffset: Double, onDone: @escaping (UIImage) -> Void) {
        guard !isBusy else { return }
        stage = .starting
        Task {
            do {
                let snapAt: Double = try await client.mutation("snaps:start", with: ["deviceToken": token, "frolicId": frolicId])
                arm(snapAt: snapAt, client: client, token: token, frolicId: frolicId, clockOffset: clockOffset, onDone: onDone)
            } catch {
                stage = .failed(checkInMessage(error))
            }
        }
    }

    func arm(snapAt: Double, client: ConvexClient, token: String, frolicId: String, clockOffset: Double, onDone: @escaping (UIImage) -> Void) {
        guard armedSnapAt != snapAt, stage != .done || snapAt > (armedSnapAt ?? 0) else { return }
        let localFire = (snapAt - clockOffset) / 1000
        guard localFire > Date().timeIntervalSince1970 - 0.9 else { return }
        armedSnapAt = snapAt
        task?.cancel()
        stage = .counting
        task = Task {
            let haptic = UIImpactFeedbackGenerator(style: .rigid)
            haptic.prepare()
            while !Task.isCancelled {
                let remaining = localFire - Date().timeIntervalSince1970
                if remaining <= 0.012 { break }
                let shown = max(1, Int(ceil(remaining)))
                if shown != numeral {
                    numeral = shown
                    haptic.impactOccurred(intensity: 0.5)
                    haptic.prepare()
                }
                let step = remaining > 0.3 ? min(remaining - 0.25, 0.05) : 0.002
                try? await Task.sleep(nanoseconds: UInt64(max(step, 0.001) * 1_000_000_000))
            }
            guard !Task.isCancelled else { return }
            while Date().timeIntervalSince1970 < localFire { }
            let fired = Date().timeIntervalSince1970
            let pending = camera.trigger()
            fireDeltaMs = (fired - localFire) * 1000
            haptic.impactOccurred(intensity: 1)
            flash = true
            let image: UIImage?
            if let pending {
                image = await pending.value
            } else {
                image = libraryShot ?? Self.stillFrame()
            }
            flash = false
            guard let image else {
                stage = .failed("The camera didn't catch it. Try again together.")
                return
            }
            photo = image
            stage = .uploading
            do {
                try await upload(image, client: client, token: token, frolicId: frolicId, takenAt: fired * 1000 + clockOffset)
                stage = .done
                onDone(image)
            } catch {
                stage = .failed(checkInMessage(error) == "That didn't go through. Try again." ? "Your shot didn't upload. Try again." : checkInMessage(error))
            }
        }
    }

    func retryUpload(client: ConvexClient, token: String, frolicId: String, clockOffset: Double, onDone: @escaping (UIImage) -> Void) {
        guard let photo else {
            start(client: client, token: token, frolicId: frolicId, clockOffset: clockOffset, onDone: onDone)
            return
        }
        stage = .uploading
        Task {
            do {
                try await upload(photo, client: client, token: token, frolicId: frolicId, takenAt: Date().timeIntervalSince1970 * 1000 + clockOffset)
                stage = .done
                onDone(photo)
            } catch {
                stage = .failed(checkInMessage(error))
            }
        }
    }

    private static func stillFrame() -> UIImage? {
        #if DEBUG || E2E
        return UIImage(named: "plan-sunsets") ?? UIImage(named: "hills_sunset")
        #else
        return nil
        #endif
    }

    private func upload(_ image: UIImage, client: ConvexClient, token: String, frolicId: String, takenAt: Double) async throws {
        let scaled = image.preparingThumbnail(of: Self.fit(image.size, max: 1600)) ?? image
        guard let data = scaled.jpegData(compressionQuality: 0.82) else {
            throw CheckInFailure.message("Your shot didn't upload. Try again.")
        }
        let raw: String = try await client.mutation("users:generateUploadUrl", with: ["deviceToken": token])
        guard let url = ReachableURL.from(raw) else { throw CheckInFailure.message("Your shot didn't upload. Try again.") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        let (body, response) = try await URLSession.shared.upload(for: request, from: data)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw CheckInFailure.message("Your shot didn't upload. Try again.")
        }
        struct Uploaded: Decodable { let storageId: String }
        let storageId = try JSONDecoder().decode(Uploaded.self, from: body).storageId
        let _: String? = try await client.mutation(
            "snaps:addMine",
            with: ["deviceToken": token, "frolicId": frolicId, "storageId": storageId, "takenAt": takenAt]
        )
    }

    private static func fit(_ size: CGSize, max side: CGFloat) -> CGSize {
        let scale = min(1, side / max(size.width, size.height, 1))
        return CGSize(width: size.width * scale, height: size.height * scale)
    }
}
