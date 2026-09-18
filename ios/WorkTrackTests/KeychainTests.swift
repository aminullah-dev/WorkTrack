import XCTest
@testable import WorkTrack

/// The Keychain round trip.
///
/// This test exists because its absence cost an afternoon: with code signing
/// disabled the app had no entitlements, every SecItemAdd returned -34018, and
/// the only symptom was the login screen appearing on every launch. A failing
/// write that returns Void looks exactly like a working one.
final class KeychainTests: XCTestCase {

    private let key = "test-refresh-token"

    override func tearDown() {
        Keychain.remove(key)
        super.tearDown()
    }

    func testWritingActuallySucceeds() {
        // The assertion that would have caught it immediately.
        XCTAssertTrue(Keychain.set("value", for: key), "Keychain write was refused")
    }

    func testRoundTrips() {
        Keychain.set("a-refresh-token", for: key)
        XCTAssertEqual(Keychain.get(key), "a-refresh-token")
    }

    func testOverwritesRatherThanDuplicating() {
        Keychain.set("first", for: key)
        Keychain.set("second", for: key)
        XCTAssertEqual(Keychain.get(key), "second")
    }

    func testRemovingLeavesNothingBehind() {
        Keychain.set("value", for: key)
        Keychain.remove(key)
        XCTAssertNil(Keychain.get(key))
    }

    func testMissingKeyIsNilNotACrash() {
        XCTAssertNil(Keychain.get("never-written-\(UUID().uuidString)"))
    }
}
