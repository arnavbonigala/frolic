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
    var isRunning = false
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var configured = false
    private var pending: CheckedContinuation<UIImage?, Never>?

    func prepare() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            guard granted else {
                mode = .denied
                return
            }
        default:
            mode = .denied
            return
        }
        guard AVCaptureDevice.default(for: .video) != nil else {
            mode = .unavailable
            return
        }
        configureIfNeeded()
        mode = configured ? .ready : .unavailable
    }

    private func configureIfNeeded() {
        guard !configured else { return }
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device)
        else { return }
        session.beginConfiguration()
        session.sessionPreset = .photo
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(output) { session.addOutput(output) }
        session.commitConfiguration()
        configured = true
    }

    func start() {
        guard configured, !isRunning else { return }
        let session = session
        Task.detached { if !session.isRunning { session.startRunning() } }
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        let session = session
        Task.detached { if session.isRunning { session.stopRunning() } }
        isRunning = false
    }

    func capture() async -> UIImage? {
        guard configured, session.isRunning else { return nil }
        return await withCheckedContinuation { continuation in
            pending = continuation
            let settings = AVCapturePhotoSettings()
            settings.flashMode = .off
            output.capturePhoto(with: settings, delegate: self)
        }
    }

    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: (any Error)?
    ) {
        let data = photo.fileDataRepresentation()
        let image = data.flatMap { UIImage(data: $0) }
        Task { @MainActor in
            self.pending?.resume(returning: image)
            self.pending = nil
        }
    }
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

        var videoLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}
