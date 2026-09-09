import XCTest
@testable import WorkTrack

/// Asking for a day to be corrected.
@MainActor
final class RegularizationTests: XCTestCase {

    private func correction(date: String, status: String) throws -> Regularization {
        let json = """
        {"id":"reg_1","date":"\(date)","requestedInAt":"2026-09-05T08:00:00.000Z",
         "requestedOutAt":null,"reason":"فراموش کردم خروج بزنم","status":"\(status)",
         "decisionNote":null}
        """
        return try JSONDecoder().decode(Regularization.self, from: Data(json.utf8))
    }

    func testOnlyOneTimeNeedsCorrecting() throws {
        // Somebody who forgot to check OUT should not have to restate when he
        // arrived; a restated time that differs slightly reads as a second
        // thing to approve.
        let request = try correction(date: "2026-09-05", status: "PENDING")
        XCTAssertNotNil(request.requestedInAt)
        XCTAssertNil(request.requestedOutAt)
    }

    func testFindsThePendingCorrectionForADay() throws {
        let overview = AttendanceHistoryViewModel.Overview(
            days: [],
            corrections: [try correction(date: "2026-09-05", status: "PENDING")]
        )
        XCTAssertNotNil(overview.pendingCorrection(on: "2026-09-05"))
        XCTAssertNil(overview.pendingCorrection(on: "2026-09-06"))
    }

    func testADecidedCorrectionDoesNotBlockAskingAgain() throws {
        // Rejected is not pending: if the manager turned it down, the worker
        // may put it right and ask again. Treating any correction as blocking
        // would leave him with no route at all.
        for status in ["APPROVED", "REJECTED", "CANCELLED"] {
            let overview = AttendanceHistoryViewModel.Overview(
                days: [], corrections: [try correction(date: "2026-09-05", status: status)]
            )
            XCTAssertNil(overview.pendingCorrection(on: "2026-09-05"), "for \(status)")
        }
    }

    func testAnUnknownStatusDoesNotBreakTheList() throws {
        XCTAssertEqual(try correction(date: "2026-09-05", status: "ESCALATED").status, .pending)
    }

    func testTheDayIsResolvedInTheCompanysTimezone() {
        // A worker checking his history from another country must see the same
        // day his site is living, not his handset's.
        let noon = Date(timeIntervalSince1970: 1_788_000_000)
        let kabul = AttendanceHistoryViewModel.isoDate(noon)

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Kabul")!
        let parts = calendar.dateComponents([.year, .month, .day], from: noon)
        XCTAssertEqual(
            kabul,
            String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
        )
    }

    func testEveryStatusTheProductUsesIsHandled() throws {
        // The exact set from AttendanceDayStatus in core/model/Attendance.kt.
        // Guessing these by hand is how "WEEK_OFF" ended up rendering raw on
        // screen beside properly translated neighbours.
        let expected: [String: AttendanceDayStatus] = [
            "PRESENT": .present, "ABSENT": .absent, "HALF_DAY": .halfDay,
            "LEAVE": .leave, "HOLIDAY": .holiday, "WEEK_OFF": .weekOff,
            "PENDING": .pending,
        ]
        for (raw, status) in expected {
            let json = """
            {"date":"2026-09-08","status":"\(raw)","firstInAt":null,
             "lastOutAt":null,"workedMinutes":0}
            """
            let day = try JSONDecoder().decode(AttendanceDay.self, from: Data(json.utf8))
            XCTAssertEqual(day.status, status, "for \(raw)")
            XCTAssertFalse(day.status!.label.isEmpty)
            // The label must be translated, never the wire value shown raw.
            XCTAssertNotEqual(day.status!.label, raw, "\(raw) is showing untranslated")
        }
    }

    func testAnUnknownDayStatusFallsBackWithoutShowingTheRawValue() throws {
        let json = """
        {"date":"2026-09-08","status":"SOMETHING_NEW","firstInAt":null,
         "lastOutAt":null,"workedMinutes":0}
        """
        let day = try JSONDecoder().decode(AttendanceDay.self, from: Data(json.utf8))
        XCTAssertEqual(day.status, .pending)
        XCTAssertNotEqual(day.status!.label, "SOMETHING_NEW")
    }

    func testAttendanceDayKnowsWhenSomebodyIsStillIn() throws {
        // The punch card reads this to decide whether the button says check in
        // or check out.
        let stillIn = """
        {"date":"2026-09-08","status":"PRESENT","firstInAt":"2026-09-08T03:30:00Z",
         "lastOutAt":null,"workedMinutes":120}
        """
        let doneForTheDay = """
        {"date":"2026-09-08","status":"PRESENT","firstInAt":"2026-09-08T03:30:00Z",
         "lastOutAt":"2026-09-08T12:00:00Z","workedMinutes":480}
        """
        XCTAssertTrue(try JSONDecoder().decode(AttendanceDay.self, from: Data(stillIn.utf8)).isClockedIn)
        XCTAssertFalse(try JSONDecoder().decode(AttendanceDay.self, from: Data(doneForTheDay.utf8)).isClockedIn)
    }
}

/// The three languages, held in step.
final class LocalizationParityTests: XCTestCase {

    func testEveryLanguageDefinesTheSameKeys() {
        // Three dictionaries edited by hand: a string added to Dari and
        // forgotten in Pashto renders the raw key on screen to exactly the
        // users least likely to report it.
        let dari = L.keys(for: .dari)
        for language in [Language.pashto, .english] {
            let keys = L.keys(for: language)
            XCTAssertEqual(
                keys.symmetricDifference(dari), [],
                "\(language.rawValue) is out of step with Dari"
            )
        }
    }

    func testNoKeyIsLeftUntranslated() {
        // t() falls back to the key itself, so an untranslated string looks
        // like "common_cancel" in the middle of a Dari screen.
        for language in Language.allCases {
            L.language = language
            for key in L.keys(for: language) {
                XCTAssertNotEqual(L.t(key), key, "\(key) is not translated in \(language.rawValue)")
            }
        }
        L.language = .dari
    }
}

/// The two timezones that meet when somebody corrects a time.
final class CorrectionTimeTests: XCTestCase {

    private func utcString(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }

    /// A Date whose wall clock reads `hour:minute` in `zone`.
    private func wallClock(_ hour: Int, _ minute: Int, in zone: String) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone)!
        return calendar.date(
            from: DateComponents(
                timeZone: TimeZone(identifier: zone), year: 2026, month: 9, day: 7,
                hour: hour, minute: minute
            )
        )!
    }

    func testTheTimeMeansWhatItSaidAtTheSite() {
        // A worker in Kabul picks 14:02 and means 14:02 at the site.
        // 14:02 Kabul is 09:32 UTC.
        let picked = wallClock(14, 2, in: "Asia/Kabul")
        let result = CorrectionRequestView.combine(
            "2026-09-07", picked, deviceZone: TimeZone(identifier: "Asia/Kabul")!
        )
        XCTAssertEqual(utcString(result!), "2026-09-07T09:32:00Z")
    }

    func testAPhoneSetToAnotherCountryStillMeansTheSitesClock() {
        // The bug this exists to stop. The picker showed 14:02 to somebody
        // whose handset is on Toronto time; reading those components in Kabul
        // instead turned the request into 22:32, and nothing said so.
        let pickedOnAToronto = wallClock(14, 2, in: "America/Toronto")
        let result = CorrectionRequestView.combine(
            "2026-09-07", pickedOnAToronto, deviceZone: TimeZone(identifier: "America/Toronto")!
        )
        // Still 14:02 at the site — the digits the person saw and chose.
        XCTAssertEqual(utcString(result!), "2026-09-07T09:32:00Z")
    }

    func testTheDateIsTheDayBeingCorrected_notToday() {
        // The picker only offers a time; the day comes from the row that was
        // tapped, or every correction would land on today.
        let picked = wallClock(8, 0, in: "Asia/Kabul")
        let result = CorrectionRequestView.combine(
            "2026-09-01", picked, deviceZone: TimeZone(identifier: "Asia/Kabul")!
        )
        XCTAssertTrue(utcString(result!).hasPrefix("2026-09-01"), utcString(result!))
    }

    func testAnUnparseableDateIsRefusedRatherThanGuessed() {
        XCTAssertNil(CorrectionRequestView.combine("not-a-date", Date()))
    }
}
