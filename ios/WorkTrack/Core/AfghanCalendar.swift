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
