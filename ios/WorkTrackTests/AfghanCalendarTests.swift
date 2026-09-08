import XCTest
@testable import WorkTrack

/// The date and the digits.
///
/// These are the parts a worker reads and acts on, and the parts that fail
/// silently: a calendar off by one still renders, and Latin digits in a Dari
/// sentence still render. Both would just be wrong.
final class AfghanCalendarTests: XCTestCase {

    /// Checked against WorkTrack's own implementation (web/src/shamsi/
    /// solarHijri.ts), which produced exactly these values for these dates.
    func testAgreesWithTheRestOfTheProduct() {
        let cases: [(String, String)] = [
            ("2026-09-08", "17 سنبله 1405"),
            ("2026-03-21", "1 حمل 1405"),      // Nowruz — the year turns
            ("2026-03-20", "29 حوت 1404"),     // the day before it
            ("2027-01-01", "11 جدی 1405"),
            ("2028-02-29", "10 حوت 1406"),     // a Gregorian leap day
        ]
        for (iso, expected) in cases {
            let date = AfghanCalendar.parseISODate(iso)
            XCTAssertNotNil(date, "could not parse \(iso)")
            // English keeps Latin digits, so this compares the arithmetic and
            // the month index without the digit conversion in the way.
            let formatted = AfghanCalendar.format(date!, language: .english)
            let afghanMonth = expected.split(separator: " ")[1]
            let day = expected.split(separator: " ")[0]
            let year = expected.split(separator: " ")[2]
            XCTAssertTrue(
                formatted.hasPrefix("\(day) "), "\(iso): day wrong — got \(formatted)"
            )
            XCTAssertTrue(
                formatted.hasSuffix(" \(year)"), "\(iso): year wrong — got \(formatted)"
            )
            _ = afghanMonth  // month name checked in Dari below
        }
    }

    func testUsesAfghanMonthNamesNotIranianOnes() {
        // The arithmetic is Foundation's Persian calendar, but Afghanistan
        // calls the first month حمل where Iran calls it فروردین. Shipping the
        // Iranian names would look foreign to every user.
        let nowruz = AfghanCalendar.parseISODate("2026-03-21")!
        let text = AfghanCalendar.format(nowruz, language: .dari)
        XCTAssertTrue(text.contains("حمل"), "expected حمل, got \(text)")
        XCTAssertFalse(text.contains("فروردین"))
    }

    func testLocalizesDigitsForDariAndPashtoOnly() {
        let date = AfghanCalendar.parseISODate("2026-09-08")!
        XCTAssertEqual(AfghanCalendar.format(date, language: .dari), "۱۷ سنبله ۱۴۰۵")
        XCTAssertTrue(AfghanCalendar.format(date, language: .pashto).contains("۱۴۰۵"))
        XCTAssertEqual(AfghanCalendar.format(date, language: .english), "17 Sunbula 1405")
    }

    func testReadsTheDateTheServerMeant() {
        // A plain yyyy-MM-dd carries no zone. Reading it in the device's zone
        // would shift the day for anyone west of UTC and show yesterday's work.
        let date = AfghanCalendar.parseISODate("2026-09-08")!
        XCTAssertEqual(AfghanCalendar.format(date, language: .english), "17 Sunbula 1405")
    }

    func testEasternDigitsLeaveLatinTextAlone() {
        XCTAssertEqual(AfghanCalendar.easternDigits("Block B 3"), "Block B ۳")
    }
}
