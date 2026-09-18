import XCTest
@testable import WorkTrack

/// Who is offered face check-in at all.
///
/// Face recognition is OFF by default for a company (DEFAULT_SETTINGS on the
/// server), and it is the most invasive thing this app does. A button that
/// appears for a company that never asked for it is the failure to avoid.
final class FaceGatingTests: XCTestCase {

    private func me(face: Bool?, enrolled: Bool?) -> Me {
        Me(
            employeeId: "e1", companyId: "c1", displayName: "احمد کریمی",
            companyName: "شرکت ساختمانی کابل", roles: ["EMPLOYEE"],
            faceEnrolled: enrolled,
            features: face.map { Me.Features(faceRecognition: $0) }
        )
    }

    func testOffWhenTheCompanyHasNotEnabledIt() {
        XCTAssertFalse(me(face: false, enrolled: false).faceEnabled)
    }

    func testOffWhenTheServerSaysNothingAboutIt() {
        // An older server, or a field that has not shipped yet: default to not
        // offering it. Silence is not consent for a biometric feature.
        XCTAssertFalse(me(face: nil, enrolled: nil).faceEnabled)
    }

    func testOnOnlyWhenExplicitlyEnabled() {
        XCTAssertTrue(me(face: true, enrolled: false).faceEnabled)
    }

    func testEnrolmentIsSeparateFromTheFeatureBeingOn() {
        // The screen shows "enrol" or "check in" based on this, so conflating
        // the two would ask an enrolled worker to enrol again every morning.
        XCTAssertFalse(me(face: true, enrolled: false).hasFace)
        XCTAssertTrue(me(face: true, enrolled: true).hasFace)
        XCTAssertFalse(me(face: true, enrolled: nil).hasFace)
    }

    func testDecodesTheServersActualMeShape() throws {
        // Trimmed from a real GET /v1/me response.
        let json = """
        {"uid":"u1","companyId":"c1","companyName":"شرکت ساختمانی کابل",
         "currency":"AFN","timezone":"Asia/Kabul","employeeId":"emp_ahmad",
         "displayName":"احمد کریمی","email":"a@b.c","avatarUrl":null,
         "roles":["EMPLOYEE"],"branchIds":["br_main"],
         "features":{"shifts":true,"leave":true,"payroll":true,
                     "regularization":true,"announcements":true,
                     "geofencing":true,"qrKiosk":true,"faceRecognition":false,
                     "finance":true},
         "faceEnrolled":false}
        """
        let decoded = try JSONDecoder().decode(Me.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.employeeId, "emp_ahmad")
        XCTAssertFalse(decoded.faceEnabled, "the demo has face off, so no button")
        XCTAssertFalse(decoded.hasFace)
    }
}
