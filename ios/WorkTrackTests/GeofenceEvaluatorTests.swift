import XCTest
@testable import WorkTrack

/// Where the worker is, relative to the site.
///
/// This exists to warn somebody BEFORE they punch. The server decides what
/// actually counts, so the one thing that must hold is that this agrees with
/// it — the rules mirrored here are the ones in
/// backend/functions/src/services/geo.ts.
final class GeofenceEvaluatorTests: XCTestCase {

    /// The Darulaman Palace, near enough to the demo's site.
    private let siteLat = 34.4735
    private let siteLng = 69.1300

    private func fence(
        _ id: String, lat: Double, lng: Double, radius: Double, active: Bool = true
    ) -> Geofence {
        Geofence(id: id, name: id, latitude: lat, longitude: lng,
                 radiusMeters: radius, active: active)
    }

    func testNoFencesMeansAnywhereIsFine() {
        // A small business with no office must still be able to punch.
        let e = GeofenceEvaluator.evaluate(
            latitude: siteLat, longitude: siteLng, accuracyMeters: 5, fences: []
        )
        XCTAssertFalse(e.fencesConfigured)
        XCTAssertFalse(e.insideFence)
        XCTAssertNil(e.distanceMeters)
    }

    func testInactiveFencesAreIgnored() {
        let e = GeofenceEvaluator.evaluate(
            latitude: siteLat, longitude: siteLng, accuracyMeters: 5,
            fences: [fence("old", lat: siteLat, lng: siteLng, radius: 100, active: false)]
        )
        XCTAssertFalse(e.fencesConfigured)
    }

    func testStandingAtTheCentreIsInside() {
        let e = GeofenceEvaluator.evaluate(
            latitude: siteLat, longitude: siteLng, accuracyMeters: 5,
            fences: [fence("site", lat: siteLat, lng: siteLng, radius: 100)]
        )
        XCTAssertTrue(e.insideFence)
        XCTAssertEqual(e.distanceMeters ?? -1, 0, accuracy: 1)
    }

    func testWellOutsideIsOutside_andSaysHowFar() {
        // ~1 km north. "Outside" alone is not actionable; the distance is.
        let e = GeofenceEvaluator.evaluate(
            latitude: siteLat + 0.009, longitude: siteLng, accuracyMeters: 5,
            fences: [fence("site", lat: siteLat, lng: siteLng, radius: 100)]
        )
        XCTAssertFalse(e.insideFence)
        XCTAssertEqual(e.distanceMeters ?? 0, 1000, accuracy: 60)
    }

    func testAccuracyIsCreditedTowardTheRadius() {
        // Mirrors the server: a fix known only to ±80 m, 150 m from a 100 m
        // fence, is treated as inside. Refusing it would punish the worker for
        // the phone's uncertainty — and the server would have accepted it,
        // leaving the app and the record disagreeing.
        let justOutside = GeofenceEvaluator.evaluate(
            latitude: siteLat + 0.00135, longitude: siteLng, accuracyMeters: 0,
            fences: [fence("site", lat: siteLat, lng: siteLng, radius: 100)]
        )
        XCTAssertFalse(justOutside.insideFence)

        let sameSpotVagueFix = GeofenceEvaluator.evaluate(
            latitude: siteLat + 0.00135, longitude: siteLng, accuracyMeters: 80,
            fences: [fence("site", lat: siteLat, lng: siteLng, radius: 100)]
        )
        XCTAssertTrue(sameSpotVagueFix.insideFence)
    }

    func testInsideAnyFenceCounts_notMerelyTheNearest() {
        // A compound and a building inside it are both normally mapped. The
        // small one can have the nearer centre while the worker stands inside
        // the large one; judging only the nearest would refuse him.
        let compound = fence("compound", lat: siteLat, lng: siteLng, radius: 500)
        let hut = fence("hut", lat: siteLat + 0.0025, lng: siteLng, radius: 20)

        let e = GeofenceEvaluator.evaluate(
            latitude: siteLat + 0.0020, longitude: siteLng, accuracyMeters: 5,
            fences: [hut, compound]
        )
        XCTAssertTrue(e.insideFence)
        XCTAssertEqual(e.nearest?.id, "compound", "should attribute to the fence it is inside")
    }

    func testHaversineMatchesAKnownDistance() {
        // One degree of latitude is ~111.2 km anywhere on the globe.
        let d = GeofenceEvaluator.haversineMeters(34.0, 69.0, 35.0, 69.0)
        XCTAssertEqual(d, 111_195, accuracy: 500)
    }
}
