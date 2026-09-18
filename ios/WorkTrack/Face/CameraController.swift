import AVFoundation
import UIKit

/// The front camera, open only while the check-in screen is on screen.
///
/// A live capture session, never a photo library. Letting somebody choose an
/// existing image would let one worker check another one in by photographing a
/// photograph — the whole point of face attendance is that the person is
/// standing there. The simulator has no camera and therefore cannot do face
/// check-in at all; see FaceCaptureView for how that is handled without
/// opening the same hole.
@MainActor
final class CameraController: NSObject, ObservableObject {
    enum State: Equatable {
        case idle
        case denied
        case unavailable
        case running
    }

    @Published private(set) var state: State = .idle

    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var pending: CheckedContinuation<UIImage, Error>?

    enum Failure: Error, Equatable {
        case notRunning
        case captureFailed
    }

    /// Asks for the camera and starts the preview.
    func start() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                state = .denied
                return
            }
        default:
            state = .denied
            return
        }

        guard
            let device = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: .front
            ),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input), session.canAddOutput(output)
        else {
            // No front camera: every simulator, and a handful of odd devices.
            state = .unavailable
            return
        }

        session.beginConfiguration()
        session.sessionPreset = .photo
        session.addInput(input)
        session.addOutput(output)
        session.commitConfiguration()

        // startRunning blocks; keeping it off the main thread stops the UI
        // hitching while the camera warms up.
        await Task.detached { [session] in session.startRunning() }.value
        state = .running
    }

    func stop() {
        guard session.isRunning else { return }
        Task.detached { [session] in session.stopRunning() }
    }

    func capture() async throws -> UIImage {
        guard state == .running else { throw Failure.notRunning }
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: self)
        }
    }
}

extension CameraController: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        Task { @MainActor in
            if let image {
                pending?.resume(returning: image)
            } else {
                pending?.resume(throwing: Failure.captureFailed)
            }
            pending = nil
        }
    }
}
