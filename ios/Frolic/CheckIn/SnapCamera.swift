import AVFoundation
import SwiftUI
import UIKit

@MainActor
@Observable
final class SnapCamera: NSObject, AVCapturePhotoCaptureDelegate {
    enum Mode: Equatable {
        case idle
        case ready
        case denied
        case unavailable
    }

    var mode: Mode = .idle
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var configured = false
    private var waiting: [Int64: CheckedContinuation<UIImage?, Never>] = [:]

    func prepare() async {
        if mode == .denied { return }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                mode = .denied
                return
            }
        default:
            mode = .denied
            return
        }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device)
        else {
            mode = .unavailable
            return
        }
        if !configured {
            session.beginConfiguration()
            session.sessionPreset = .photo
            if session.canAddInput(input) { session.addInput(input) }
            if session.canAddOutput(output) { session.addOutput(output) }
            output.maxPhotoQualityPrioritization = .speed
            if output.isZeroShutterLagSupported { output.isZeroShutterLagEnabled = true }
            if output.isResponsiveCaptureSupported { output.isResponsiveCaptureEnabled = true }
            session.commitConfiguration()
            configured = true
        }
        let session = session
        await Task.detached { if !session.isRunning { session.startRunning() } }.value
        mode = .ready
    }

    func stop() {
        let session = session
        Task.detached { if session.isRunning { session.stopRunning() } }
    }

    func trigger() -> Task<UIImage?, Never>? {
        guard mode == .ready, configured, session.isRunning else { return nil }
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .off
        settings.photoQualityPrioritization = .speed
        let id = settings.uniqueID
        output.capturePhoto(with: settings, delegate: self)
        return Task {
            if let image = early.removeValue(forKey: id) { return image }
            return await withCheckedContinuation { continuation in
                if let image = early.removeValue(forKey: id) {
                    continuation.resume(returning: image)
                } else {
                    waiting[id] = continuation
                }
            }
        }
    }

    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: (any Error)?) {
        let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        let id = photo.resolvedSettings.uniqueID
        Task { @MainActor in
            if let continuation = waiting.removeValue(forKey: id) {
                continuation.resume(returning: image)
            } else {
                early[id] = image
            }
        }
    }

    private var early: [Int64: UIImage?] = [:]
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.videoLayer.session = session
        view.videoLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
