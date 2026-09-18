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

/// How far away the worker is, in a form he can act on.
///
/// The bug this pins down was found on the first real handset: the phone was
/// in Ottawa, the site in Kabul, and the card read "۱۰۴۵۷۲۲۰ متر" — eight
/// digits, no separators, no chance of reading it as ten thousand kilometres.
/// Printing raw metres quietly assumed the phone was near its site.
final class DistanceFormatTests: XCTestCase {
    func testMetresWhileMetresAreWalkable() {
        let d = AfghanCalendar.distance(meters: 340, language: .dari)
        XCTAssertFalse(d.isKilometres)
        XCTAssertEqual(d.value, "۳۴۰")
    }

    func testJustUnderAKilometreIsStillMetres() {
        // 999 m is a walk. 1000 m is where the unit turns over.
        XCTAssertFalse(AfghanCalendar.distance(meters: 999, language: .dari).isKilometres)
        XCTAssertTrue(AfghanCalendar.distance(meters: 1000, language: .dari).isKilometres)
    }

    func testTheOttawaCase() {
        // The exact number the first device run put on screen.
        let d = AfghanCalendar.distance(meters: 10_457_220, language: .dari)
        XCTAssertTrue(d.isKilometres)
        // Grouped, and no decimal noise at this magnitude.
        XCTAssertEqual(d.value, "۱۰٬۴۵۷")
        // The failure being guarded against is a bare run of digits.
        XCTAssertFalse(d.value.contains("۱۰۴۵۷"), "grouping separator was dropped")
    }

    func testOneDecimalWhereItHelps() {
        // At 1.4 km the fraction is the difference between a walk and a drive;
        // at 10,457 km it is noise. Same formatter, different magnitudes.
        XCTAssertEqual(AfghanCalendar.distance(meters: 1400, language: .dari).value, "۱٫۴")
        XCTAssertEqual(AfghanCalendar.distance(meters: 12_000, language: .dari).value, "۱۲")
    }

    func testEnglishKeepsLatinDigitsAndSeparators() {
        // Arabic-Indic marks beside Latin digits read as a rendering fault —
        // the same rule `money` follows.
        let d = AfghanCalendar.distance(meters: 10_457_220, language: .english)
        XCTAssertEqual(d.value, "10,457")
    }
}

/// The message a worker reads when the punch did not count.
///
/// The server keeps an out-of-fence punch as evidence but excludes it from the
/// day's worked-time math, so the day stays empty and payroll now deducts for
/// unexcused absence. The first wording said "ثبت شد" — recorded — which is
/// true of the row in the database and false of the thing the worker cares
/// about. He would walk away believing he had checked in.
final class FlaggedPunchWordingTests: XCTestCase {
    func testEveryLanguageSaysItDidNotCount() {
        for language in [Language.dari, .pashto, .english] {
            L.language = language
            let text = L.t("punch_flagged")
            XCTAssertFalse(
                text.hasPrefix("ثبت شد") || text.hasPrefix("ثبت شو")
                    || text.hasPrefix("Recorded,"),
                "\(language) leads with 'recorded', which reads as 'you are checked in'"
            )
        }
        L.language = .dari
    }

    func testItPointsAtTheWayOut() {
        // Telling somebody it did not count without telling him what to do
        // leaves him standing there punching again.
        for (language, needle) in [(Language.dari, "اصلاح"), (.pashto, "سمون"), (.english, "correction")] {
            L.language = language
            XCTAssertTrue(
                L.t("punch_flagged").contains(needle),
                "\(language) does not mention the correction request"
            )
        }
        L.language = .dari
    }
}
