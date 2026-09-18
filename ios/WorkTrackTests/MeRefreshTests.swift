import XCTest
@testable import WorkTrack

/// Re-reading `me` when the app comes forward.
///
/// Features ride on `me`, and `me` used to be read only at launch. So a
/// manager could switch face check-in on in the portal, tell the worker to
/// look, and nothing would happen until the app was force-quit — with nothing
/// on screen to say why.
///
/// Two things have to hold for the fix to work, and neither of them fails
/// loudly if it breaks.
final class MeRefreshTests: XCTestCase {

    private func me(face: Bool?) -> Me {
        Me(
            employeeId: "e1", companyId: "c1", displayName: "احمد کریمی",
            companyName: "شرکت ساختمانی کابل", roles: ["EMPLOYEE"],
            faceEnrolled: false,
            features: face.map { Me.Features(faceRecognition: $0) }
        )
    }

    // MARK: - What a failed refresh does to the session

    func testATemporaryServerFailureKeepsThePersonSignedIn() {
        // THE one to get right. This runs every time the app comes forward,
        // on a lot of phones, and the wrong answer here is not a crash — it
        // is a site full of workers on the login screen the first time the
        // server has a bad minute. They cannot sign back in either: that
        // needs the same server.
        for status in [500, 502, 503] {
            XCTAssertEqual(
                AuthStore.outcome(for: ApiError.problem(status: status, code: "x", detail: "")),
                .keep,
                "a \(status) must not sign anybody out"
            )
        }
    }

    func testNoSignalKeepsThePersonSignedIn() {
        // A site with no mast is the normal case here, not the exception.
        XCTAssertEqual(AuthStore.outcome(for: ApiError.offline), .keep)
    }

    func testAnUnreadableBodyKeepsThePersonSignedIn() {
        // A server that shipped a shape this build does not know is a reason
        // to carry on with what we have, not to throw the session away.
        XCTAssertEqual(AuthStore.outcome(for: ApiError.malformedResponse), .keep)
    }

    func testAnUnknownErrorKeepsThePersonSignedIn() {
        // Whatever it turns out to be, staying signed in is the safe default.
        XCTAssertEqual(
            AuthStore.outcome(for: NSError(domain: "somewhere", code: 1)),
            .keep
        )
    }

    func testARevokedTokenEndsTheSession() {
        // The other side of it, and this one is wanted: disabling an employee
        // revokes their token, so somebody who has left the company stops
        // being in the app at the next foreground rather than lingering until
        // they happen to tap something.
        XCTAssertEqual(AuthStore.outcome(for: ApiError.unauthenticated), .endSession)
    }

    func testAForbiddenIsNotARevokedToken() {
        // 403 is "you may not do that", not "you are nobody". Signing out on
        // it would eject anyone who hit a permission wall.
        XCTAssertEqual(
            AuthStore.outcome(for: ApiError.problem(status: 403, code: "FORBIDDEN", detail: "")),
            .keep
        )
    }

    // MARK: - Noticing that something changed

    func testSwitchingFaceOnMakesADifferentPerson() {
        // refreshMe only republishes when the new `me` differs from the old
        // one, to avoid re-rendering every screen on every foreground. If
        // equality ever stopped accounting for features, the refresh would
        // fetch the new flag, compare equal, publish nothing — and the button
        // would stay hidden exactly as before. The whole fix rests on this.
        XCTAssertNotEqual(me(face: false), me(face: true))
        XCTAssertNotEqual(me(face: nil), me(face: true))
    }

    func testAnUnchangedPersonIsUnchanged() {
        XCTAssertEqual(me(face: true), me(face: true))
    }
}
