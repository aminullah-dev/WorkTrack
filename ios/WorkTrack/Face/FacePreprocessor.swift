import CoreGraphics
import Foundation
import UIKit

/// Turning a cropped face into the exact float buffer MobileFaceNet expects.
///
/// This file is the whole risk of the feature. The model runs on Android too,
/// and the server compares the two vectors with cosine similarity against a
/// fixed 0.6 threshold — so an employee who enrolled on Android has to produce
/// a matching vector here. Get any of this subtly wrong and nothing errors:
/// the model still runs, still returns 192 plausible numbers, and the
/// similarity just quietly falls under the threshold. The worker is standing
/// at the gate and the app does not know him.
///
/// The contract, copied from FaceEmbedder.kt and pinned by tests:
///
///   input        112 × 112
///   channels     R, G, B — in that order
///   normalise    (channel − 127.5) / 128
///   layout       float32, interleaved per pixel, row-major
///   output       192 floats, L2-normalised
enum FacePreprocessor {
    static let inputSize = 112
    static let channels = 3

    /// A face bitmap → the model's input buffer.
    ///
    /// Resized with the same "scale to the target box" the Android side uses
    /// (`Bitmap.createScaledBitmap`), NOT an aspect-preserving fit: changing
    /// the geometry would move the face inside the frame relative to every
    /// embedding already enrolled.
    static func inputBuffer(from image: UIImage) -> [Float]? {
        guard let pixels = rgbaPixels(from: image, side: inputSize) else { return nil }

        var out = [Float]()
        out.reserveCapacity(inputSize * inputSize * channels)
        for i in stride(from: 0, to: pixels.count, by: 4) {
            // RGBA source, and only R, G, B are taken — alpha is not an input.
            out.append(normalise(pixels[i]))
            out.append(normalise(pixels[i + 1]))
            out.append(normalise(pixels[i + 2]))
        }
        return out
    }

    /// MobileFaceNet's normalisation. Not /255, and not mean-subtraction —
    /// either would produce a valid-looking vector in the wrong space.
    static func normalise(_ channel: UInt8) -> Float {
        (Float(channel) - 127.5) / 128
    }

    /// L2 normalisation, applied to the model's output before it is sent.
    ///
    /// The server's cosine similarity divides by the magnitudes anyway, so this
    /// does not change the comparison — but the Android client normalises
    /// before sending, and the vectors are stored as sent. Keeping both clients
    /// identical means a stored embedding is the same thing whichever phone
    /// wrote it.
    static func l2Normalise(_ vector: [Float]) -> [Float] {
        let magnitude = sqrt(vector.reduce(0) { $0 + $1 * $1 })
        guard magnitude > 0 else { return vector }
        return vector.map { $0 / magnitude }
    }

    /// Draws the image into a square RGBA byte buffer of `side` × `side`.
    private static func rgbaPixels(from image: UIImage, side: Int) -> [UInt8]? {
        guard let cgImage = image.cgImage else { return nil }
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        guard let context = CGContext(
            data: &pixels,
            width: side,
            height: side,
            bitsPerComponent: 8,
            bytesPerRow: side * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            // Alpha last, and NOT premultiplied: premultiplying would scale the
            // colour channels by alpha and shift every value the model sees.
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { return nil }

        context.interpolationQuality = .high
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
        return pixels
    }
}
