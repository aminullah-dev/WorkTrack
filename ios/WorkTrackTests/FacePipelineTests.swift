import XCTest
@testable import WorkTrack

/// The face pipeline.
///
/// Every one of these guards the same failure: the model runs, returns 192
/// plausible numbers, and the cosine similarity quietly falls under the
/// server's 0.6 threshold — so an employee who enrolled on Android stops being
/// recognised, with no error anywhere. Nothing here is about crashes.
final class FacePipelineTests: XCTestCase {

    // MARK: preprocessing — the contract copied from FaceEmbedder.kt

    func testNormalisationMatchesTheAndroidFormula() {
        // (channel − 127.5) / 128. NOT /255, and not mean-subtraction: both
        // would produce a valid-looking vector in the wrong space.
        XCTAssertEqual(FacePreprocessor.normalise(0), -127.5 / 128, accuracy: 1e-6)
        XCTAssertEqual(FacePreprocessor.normalise(255), 127.5 / 128, accuracy: 1e-6)
        XCTAssertEqual(FacePreprocessor.normalise(128), 0.5 / 128, accuracy: 1e-6)
    }

    func testInputIsTheSizeAndShapeTheModelExpects() {
        let image = solidImage(.init(red: 0.5, green: 0.5, blue: 0.5, alpha: 1), side: 200)
        let buffer = FacePreprocessor.inputBuffer(from: image)

        XCTAssertEqual(buffer?.count, 112 * 112 * 3, "112×112×3 floats, whatever came in")
    }

    func testChannelOrderIsRGB_notBGR() {
        // The single most likely silent mistake. A pure red image must put the
        // large value FIRST; BGR would put it third and every embedding would
        // be of a different-coloured face.
        let red = solidImage(.init(red: 1, green: 0, blue: 0, alpha: 1), side: 112)
        guard let buffer = FacePreprocessor.inputBuffer(from: red) else {
            return XCTFail("no buffer")
        }
        XCTAssertEqual(buffer[0], FacePreprocessor.normalise(255), accuracy: 0.02, "R")
        XCTAssertEqual(buffer[1], FacePreprocessor.normalise(0), accuracy: 0.02, "G")
        XCTAssertEqual(buffer[2], FacePreprocessor.normalise(0), accuracy: 0.02, "B")
    }

    func testAlphaIsNotPremultiplied() {
        // Premultiplying scales the colour channels by alpha and shifts every
        // value the model sees.
        let white = solidImage(.init(red: 1, green: 1, blue: 1, alpha: 1), side: 112)
        guard let buffer = FacePreprocessor.inputBuffer(from: white) else {
            return XCTFail("no buffer")
        }
        XCTAssertEqual(buffer[0], FacePreprocessor.normalise(255), accuracy: 0.02)
    }

    func testL2NormalisationMakesAUnitVector() {
        let normalised = FacePreprocessor.l2Normalise([3, 4])
        XCTAssertEqual(normalised[0], 0.6, accuracy: 1e-6)
        XCTAssertEqual(normalised[1], 0.8, accuracy: 1e-6)
        XCTAssertEqual(sqrt(normalised.reduce(0) { $0 + $1 * $1 }), 1, accuracy: 1e-6)
    }

    func testL2OfAZeroVectorDoesNotDivideByZero() {
        XCTAssertEqual(FacePreprocessor.l2Normalise([0, 0, 0]), [0, 0, 0])
    }

    // MARK: the crop

    func testVisionBoxIsFlippedToImageCoordinates() {
        // Vision's origin is bottom-left, CoreGraphics' is top-left. Getting
        // this wrong crops the forehead — and still returns an image, so
        // nothing errors and the embedding is of the wrong thing.
        let image = solidImage(.init(red: 0, green: 0, blue: 0, alpha: 1), side: 100).cgImage!
        // Pixel dimensions, not points: a rendered UIImage is Retina-scaled, so
        // the CGImage is 3x on this device. pixelRect works in pixels, which is
        // what CGImage.cropping wants.
        let pixelHeight = CGFloat(image.height)

        // A box in the TOP half as Vision sees it (maxY = 1.0).
        let visionTopHalf = CGRect(x: 0, y: 0.5, width: 1, height: 0.5)
        let rect = FaceDetector.pixelRect(visionTopHalf, in: image)

        XCTAssertEqual(rect.minY, 0, "a Vision box at the top must crop from y=0")
        XCTAssertEqual(rect.height, pixelHeight / 2, accuracy: 1)

        // And the mirror case, which is what catches a missing flip: a box at
        // the BOTTOM must crop from the bottom, not the top.
        let visionBottomHalf = CGRect(x: 0, y: 0, width: 1, height: 0.5)
        let bottom = FaceDetector.pixelRect(visionBottomHalf, in: image)
        XCTAssertEqual(bottom.minY, pixelHeight / 2, accuracy: 1)
    }

    // MARK: the model — the part that has to agree with Android

    func testTheModelLoadsAndProducesTheExpectedShape() throws {
        let embedder = try FaceEmbedder()
        XCTAssertTrue(
            [128, 192].contains(embedder.embeddingSize),
            "unexpected embedding size \(embedder.embeddingSize)"
        )

        let face = solidImage(.init(red: 0.6, green: 0.5, blue: 0.4, alpha: 1), side: 112)
        let embedding = try embedder.embed(face)

        XCTAssertEqual(embedding.count, embedder.embeddingSize)
        XCTAssertEqual(sqrt(embedding.reduce(0) { $0 + $1 * $1 }), 1, accuracy: 1e-4,
                       "what is sent must be L2-normalised, as on Android")
    }

    func testTheSameFaceTwiceIsTheSameVector() throws {
        // Determinism is the floor. If one phone cannot reproduce its own
        // embedding, two phones certainly cannot.
        let embedder = try FaceEmbedder()
        let face = solidImage(.init(red: 0.6, green: 0.5, blue: 0.4, alpha: 1), side: 112)

        let a = try embedder.embed(face)
        let b = try embedder.embed(face)
        XCTAssertEqual(cosine(a, b), 1, accuracy: 1e-5)
    }

    func testDifferentInputsGiveDifferentVectors() throws {
        // The counterpart: a model returning a constant would pass every test
        // above and match everybody against everybody.
        let embedder = try FaceEmbedder()
        let one = try embedder.embed(solidImage(.init(red: 0.9, green: 0.2, blue: 0.2, alpha: 1), side: 112))
        let two = try embedder.embed(solidImage(.init(red: 0.1, green: 0.8, blue: 0.7, alpha: 1), side: 112))

        XCTAssertLessThan(cosine(one, two), 0.99, "the model is not discriminating at all")
    }

    // MARK: helpers

    /// The server's rule, reproduced so the tests can talk in its terms.
    private func cosine(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count, !a.isEmpty else { return -1 }
        let dot = zip(a, b).reduce(Float(0)) { $0 + $1.0 * $1.1 }
        let magA = sqrt(a.reduce(0) { $0 + $1 * $1 })
        let magB = sqrt(b.reduce(0) { $0 + $1 * $1 })
        return magA > 0 && magB > 0 ? dot / (magA * magB) : -1
    }

    private func solidImage(_ color: UIColor, side: Int) -> UIImage {
        let size = CGSize(width: side, height: side)
        return UIGraphicsImageRenderer(size: size).image { context in
            color.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }
}

/// How a face-verified punch is put together.
final class FacePunchTests: XCTestCase {

    private func punch(faceToken: String?) -> QueuedPunch {
        QueuedPunch(
            id: ULID.generate(), punchedAt: Date(), type: "IN",
            latitude: 34.5553, longitude: 69.2075, accuracyMeters: 10,
            insideFence: true, faceToken: faceToken
        )
    }

    func testAPlainPunchIsGPS() {
        XCTAssertEqual(punch(faceToken: nil).method, "GPS")
    }

    func testAVerifiedPunchIsRecordedAsFACE() {
        // So the attendance record says HOW it was made, not just that it was.
        XCTAssertEqual(punch(faceToken: "signed.token").method, "FACE")
    }

    func testTheTokenSurvivesBeingQueuedOffline() throws {
        // A face check made in a valley must still count as face-verified when
        // the punch finally sends — the token is short-lived, so this is also
        // the case where the server may refuse it, and that is its decision to
        // make, not the phone's.
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = OfflineStore(directory: directory)

        let original = punch(faceToken: "signed.token")
        store.save([original], to: "punch-outbox")

        let reloaded = try XCTUnwrap(store.load([QueuedPunch].self, from: "punch-outbox")).first
        XCTAssertEqual(reloaded?.faceToken, "signed.token")
        XCTAssertEqual(reloaded?.method, "FACE")
    }
}
