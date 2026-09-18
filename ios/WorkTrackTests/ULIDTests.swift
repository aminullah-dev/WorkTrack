import XCTest
@testable import WorkTrack

/// The punch id, which is what makes a punch idempotent.
final class ULIDTests: XCTestCase {

    func testIsExactlyWhatTheServerAccepts() {
        // punchCreateSchema requires length 26; a 25 or 27 would be rejected
        // for every punch, and only in the field.
        for _ in 0..<200 {
            XCTAssertEqual(ULID.generate().count, 26)
        }
    }

    func testUsesCrockfordBase32Only() {
        let allowed = Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
        for _ in 0..<200 {
            XCTAssertTrue(ULID.generate().allSatisfy { allowed.contains($0) })
        }
    }

    func testIsUnique() {
        // Two punches in the same millisecond must not collide into one
        // document — the id is the idempotency key.
        let now = Date()
        let ids = Set((0..<2000).map { _ in ULID.generate(at: now) })
        XCTAssertEqual(ids.count, 2000)
    }

    func testSortsByTime() {
        let earlier = ULID.generate(at: Date(timeIntervalSince1970: 1_000_000))
        let later = ULID.generate(at: Date(timeIntervalSince1970: 2_000_000))
        XCTAssertLessThan(earlier.prefix(10), later.prefix(10))
    }
}
