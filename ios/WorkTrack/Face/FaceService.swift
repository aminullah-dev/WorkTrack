import Foundation
import UIKit

/// Enrolling a face, and verifying one at check-in.
///
/// Only the embedding crosses the wire. The photo never leaves the phone, is
/// never written to disk, and is not held after the vector is computed.
///
/// Verification is a TWO-STEP handshake and that is deliberate on the server's
/// side: /attendance/face/verify returns a short-lived signed token, and the
/// punch that follows must present it. The client cannot assert "this was
/// face-verified" on its own — `faceVerified` is derived from the token
/// server-side and is never read from the request body.
@MainActor
final class FaceService {
    struct VerifyResult: Decodable {
        let match: Bool
        let similarity: Double
        let threshold: Double
        /// Present only on a match; the punch carries it as proof.
        let token: String?
    }

    private struct EnrolResult: Decodable {
        let enrolled: Bool?
    }

    private let client: ApiClient
    private let embedder: FaceEmbedder

    init(client: ApiClient, embedder: FaceEmbedder) {
        self.client = client
        self.embedder = embedder
    }

    /// Enrol the caller's own face. The server refuses a second enrolment
    /// (FACE_ALREADY_ENROLLED) rather than overwriting one.
    func enrol(_ photo: UIImage) async throws -> Bool {
        let embedding = try await embedding(from: photo)
        let result: EnrolResult = try await client.post(
            "me/face/enroll", body: ["embedding": embedding]
        )
        return result.enrolled ?? true
    }

    /// Check a face against the enrolled one. A near-miss is reported with its
    /// similarity so the UI can say "come closer" rather than "not you".
    func verify(_ photo: UIImage) async throws -> VerifyResult {
        let embedding = try await embedding(from: photo)
        return try await client.post(
            "attendance/face/verify", body: ["embedding": embedding]
        )
    }

    /// Crop, embed, and hand back plain numbers. The UIImage goes out of scope
    /// here and is never retained.
    private func embedding(from photo: UIImage) async throws -> [Double] {
        let face = try await FaceDetector.crop(from: photo)
        // Doubles because JSONSerialization writes Float as a Double anyway,
        // and the server compares in double precision.
        return try embedder.embed(face).map(Double.init)
    }
}
