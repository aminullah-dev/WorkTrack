import Foundation
import TensorFlowLite
import UIKit

/// On-device face embedding with the MobileFaceNet TFLite model.
///
/// The SAME model file as the Android app — copied from
/// feature/attendance/src/main/assets/mobilefacenet.tflite — run through the
/// same interpreter. That is not a convenience: identity matching is cosine
/// similarity on the server against whatever vector the enrolling phone
/// produced, so the two clients must land in one vector space or an employee
/// who enrolled on Android is simply not recognised here.
///
/// Only the numbers ever leave the device. No photo is uploaded or stored.
enum FaceEmbedderError: Error, Equatable {
    /// The model asset is missing from the bundle.
    case modelUnavailable
    /// The image could not be turned into the model's input.
    case badInput
    case inferenceFailed
}

final class FaceEmbedder {
    private let interpreter: Interpreter
    /// Read from the model rather than hard-coded, so a 128-d or 192-d
    /// MobileFaceNet both work — as on Android.
    let embeddingSize: Int

    init() throws {
        guard let path = Bundle.main.path(forResource: "mobilefacenet", ofType: "tflite") else {
            throw FaceEmbedderError.modelUnavailable
        }
        do {
            interpreter = try Interpreter(modelPath: path)
            try interpreter.allocateTensors()
            let output = try interpreter.output(at: 0)
            embeddingSize = output.shape.dimensions.last ?? 192
        } catch {
            throw FaceEmbedderError.modelUnavailable
        }
    }

    /// A cropped face → an L2-normalised embedding, ready to send.
    func embed(_ face: UIImage) throws -> [Float] {
        guard let input = FacePreprocessor.inputBuffer(from: face) else {
            throw FaceEmbedderError.badInput
        }
        do {
            try input.withUnsafeBufferPointer { buffer in
                try interpreter.copy(Data(buffer: buffer), toInputAt: 0)
            }
            try interpreter.invoke()
            let output = try interpreter.output(at: 0)
            let values = output.data.withUnsafeBytes { raw in
                Array(raw.bindMemory(to: Float.self))
            }
            return FacePreprocessor.l2Normalise(values)
        } catch {
            throw FaceEmbedderError.inferenceFailed
        }
    }
}
