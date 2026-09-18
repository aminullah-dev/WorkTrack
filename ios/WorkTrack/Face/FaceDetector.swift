import UIKit
import Vision

/// Finds the face in a camera frame and crops it the way the model expects.
///
/// Vision replaces ML Kit here — both give a face bounding box, and the box is
/// all that is used. What must NOT differ from Android is what happens to that
/// box afterwards, so the crop rules live in one place and are tested.
enum FaceDetector {
    enum Failure: Error, Equatable {
        case noFace
        case tooManyFaces
        case tooSmall
    }

    /// A face smaller than this fraction of the frame is too far away to embed
    /// reliably; better to ask the worker to come closer than to enrol a blur.
    static let minimumFaceFraction: CGFloat = 0.08

    static func crop(from image: UIImage) async throws -> UIImage {
        guard let cgImage = image.cgImage else { throw Failure.noFace }

        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
        try handler.perform([request])

        let faces = request.results ?? []
        guard !faces.isEmpty else { throw Failure.noFace }
        // Two faces means we cannot know whose attendance this is.
        guard faces.count == 1 else { throw Failure.tooManyFaces }

        let face = faces[0]
        guard face.boundingBox.width >= minimumFaceFraction else { throw Failure.tooSmall }

        let rect = pixelRect(face.boundingBox, in: cgImage)
        guard let cropped = cgImage.cropping(to: rect) else { throw Failure.noFace }
        return UIImage(cgImage: cropped)
    }

    /// Vision reports a normalised box with the origin at the BOTTOM-left;
    /// CoreGraphics images are indexed from the top. Getting this flip wrong
    /// crops the forehead instead of the face — and still returns an image, so
    /// nothing errors and the embedding is simply of the wrong thing.
    static func pixelRect(_ boundingBox: CGRect, in image: CGImage) -> CGRect {
        let width = CGFloat(image.width)
        let height = CGFloat(image.height)
        return CGRect(
            x: boundingBox.minX * width,
            y: (1 - boundingBox.maxY) * height,
            width: boundingBox.width * width,
            height: boundingBox.height * height
        ).integral
    }
}
