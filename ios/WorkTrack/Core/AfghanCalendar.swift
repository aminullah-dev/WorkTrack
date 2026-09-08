import Foundation

/// Dates the way Afghanistan reads them.
///
/// Foundation's `.persian` calendar already implements Solar Hijri arithmetic,
/// and it was checked against WorkTrack's own implementation
/// (web/src/shamsi/solarHijri.ts) across Nowruz and a leap day before this was
/// written — same year, month and day on every case. So the arithmetic is
/// Foundation's; only the month NAMES are ours, because Afghanistan uses the
/// Arabic-derived names (حمل، ثور، جوزا…) where Iran uses the Persian ones
/// (فروردین، اردیبهشت…) for the very same months.
enum AfghanCalendar {
    /// Month names by index 1…12, per locale. Mirrors SHAMSI_MONTHS in
    /// web/src/i18n/LocaleProvider.tsx.
    fileprivate static let monthsInternal = true
    private static let months: [Language: [String]] = [
        .dari: ["حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
                "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت"],
        .pashto: ["وری", "غویی", "غبرګولی", "چنګاښ", "زمری", "وږی",
                  "تله", "لړم", "لیندۍ", "مرغومی", "سلواغه", "کب"],
        .english: ["Hamal", "Sawr", "Jawza", "Saratan", "Asad", "Sunbula",
                   "Mizan", "Aqrab", "Qaws", "Jadi", "Dalwa", "Hut"],
    ]

    private static var calendar: Calendar = {
        var c = Calendar(identifier: .persian)
        // The company's day, not the phone's. A worker whose handset is still
        // set to another country must see the same date as the site he is on.
        c.timeZone = TimeZone(identifier: "Asia/Kabul") ?? .current
        return c
    }()

    /// "۱۷ سنبله ۱۴۰۵" — the form a date is spoken in.
    static func format(_ date: Date, language: Language, withYear: Bool = true) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let name = months[language]?[max(0, min(11, (parts.month ?? 1) - 1))] ?? ""
        let base = withYear
            ? "\(parts.day ?? 0) \(name) \(parts.year ?? 0)"
            : "\(parts.day ?? 0) \(name)"
        return language.localizesDigits ? easternDigits(base) : base
    }

    /// The Solar Hijri year we are in — what the payslips endpoint expects.
    static func currentShamsiYear(now: Date = Date()) -> Int {
        calendar.dateComponents([.year], from: now).year ?? 1405
    }

    /// The month name for a Solar Hijri month number, for a payslip heading.
    static func monthName(_ month: Int, language: Language) -> String {
        months[language]?[max(0, min(11, month - 1))] ?? ""
    }

    /// Money, the way it is written here: "۳۱٬۸۶۶٫۶۶ افغانی".
    ///
    /// Grouped, two decimals only when there are any, and the digits localised
    /// with everything else — a Latin-numeral figure in a Dari sentence reads
    /// as though it belongs to a different document.
    static func money(_ amount: Double, currency: String, language: Language) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        // The separators follow the SCRIPT, not the currency: Arabic-Indic
        // marks beside Latin digits ("1٬234٫50") is neither one convention nor
        // the other, and reads as a rendering fault.
        formatter.groupingSeparator = language.localizesDigits ? "\u{066C}" : ","
        formatter.decimalSeparator = language.localizesDigits ? "\u{066B}" : "."
        formatter.maximumFractionDigits = amount == amount.rounded() ? 0 : 2
        formatter.minimumFractionDigits = formatter.maximumFractionDigits
        let number = formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
        let localised = language.localizesDigits ? easternDigits(number) : number
        let name = currency == "AFN" && language != .english ? "افغانی" : currency
        return "\(localised) \(name)"
    }

    /// Parses a plain `yyyy-MM-dd` from the API. These carry no time and no
    /// zone; reading them as UTC keeps the calendar date the server meant.
    static func parseISODate(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)
    }

    /// ۰–۹ for Dari and Pashto; Latin digits look wrong in both.
    static func easternDigits(_ s: String) -> String {
        let eastern = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"]
        return String(s.map { ch -> Character in
            guard let d = ch.wholeNumberValue, (0...9).contains(d), ch.isASCII else { return ch }
            return Character(eastern[d])
        })
    }
}
