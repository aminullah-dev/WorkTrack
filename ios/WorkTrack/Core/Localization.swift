import Foundation

/// The three languages, in the order the product treats them.
enum Language: String, CaseIterable {
    case dari = "fa"
    case pashto = "ps"
    case english = "en"

    var isRTL: Bool { self != .english }
    var localizesDigits: Bool { self != .english }

    var label: String {
        switch self {
        case .dari: return "دری"
        case .pashto: return "پښتو"
        case .english: return "English"
        }
    }
}

/// UI strings, held in dictionaries rather than .strings files.
///
/// That is the same shape the portal uses (web/src/i18n/strings.ts) and it is
/// deliberate: the three languages have to be edited side by side to stay
/// honest with each other, and three .strings files make that harder, not
/// easier. Keys mirror the portal's where the screen is the same.
enum L {
    static var language: Language = .dari

    static func t(_ key: String) -> String {
        dictionaries[language]?[key] ?? dictionaries[.dari]?[key] ?? key
    }

    /// Digits localized too, so numbers inside a sentence match the script.
    static func n(_ value: some CustomStringConvertible) -> String {
        language.localizesDigits
            ? AfghanCalendar.easternDigits(value.description)
            : value.description
    }

    private static let dictionaries: [Language: [String: String]] = [
        .dari: [
            "app_name": "ورک‌ترک",
            "sign_in_title": "خوش آمدید",
            "sign_in_subtitle": "مدیریت هوشمند نیروی کار برای افغانستان",
            "email": "ایمیل کاری",
            "password": "رمز عبور",
            "sign_in": "ورود",
            "signing_in": "در حال ورود…",
            "sign_out": "خروج",
            "err_bad_credentials": "ایمیل یا رمز عبور درست نیست",
            "err_offline": "به انترنت وصل نیستید",
            "err_generic": "مشکلی پیش آمد",
            "work_title": "کار شما",
            "work_today": "امروز",
            "work_next": "روز کاری بعد",
            "work_none_today": "برای امروز کاری به شما تعیین نشده. اگر مطمئن نیستید، از سرپرست خود بپرسید.",
            "work_none_next": "برای این روز هنوز کاری تعیین نشده.",
            "work_weekend": "این روز رخصتی هفته‌وار است.",
            "work_holiday": "این روز رخصتی رسمی است.",
            "work_team": "کار تیمی",
            "work_solo": "انفرادی",
            "work_with": "همراه",
            "work_start": "شروع کردم",
            "work_finish": "تمام شد",
            "status_planned": "پلان‌شده",
            "status_in_progress": "در جریان",
            "status_done": "انجام شد",
            "status_blocked": "متوقف",
            "retry": "دوباره",
        ],
        .pashto: [
            "app_name": "ورک‌ټرک",
            "sign_in_title": "ښه راغلاست",
            "sign_in_subtitle": "د افغانستان لپاره د کاري ځواک هوښیار مدیریت",
            "email": "کاري ایمیل",
            "password": "پټنوم",
            "sign_in": "ننوتل",
            "signing_in": "په ننوتلو کې…",
            "sign_out": "وتل",
            "err_bad_credentials": "ایمیل یا پټنوم سم نه دی",
            "err_offline": "له انټرنټ سره نه یاست وصل",
            "err_generic": "ستونزه رامنځته شوه",
            "work_title": "ستاسو کار",
            "work_today": "نن",
            "work_next": "راتلونکې کاري ورځ",
            "work_none_today": "د نن ورځې لپاره تاسو ته کار نه دی ټاکل شوی. که ډاډه نه یاست، له خپل سرپرست وپوښتئ.",
            "work_none_next": "د دې ورځې لپاره لا کار نه دی ټاکل شوی.",
            "work_weekend": "دا ورځ د اونۍ رخصتي ده.",
            "work_holiday": "دا ورځ رسمي رخصتي ده.",
            "work_team": "ټیمي کار",
            "work_solo": "انفرادي",
            "work_with": "ملګري",
            "work_start": "پیل مې کړ",
            "work_finish": "بشپړ شو",
            "status_planned": "پلان شوی",
            "status_in_progress": "روان",
            "status_done": "ترسره شو",
            "status_blocked": "درېدلی",
            "retry": "بیا",
        ],
        .english: [
            "app_name": "WorkTrack",
            "sign_in_title": "Welcome",
            "sign_in_subtitle": "Workforce management for Afghan businesses",
            "email": "Work email",
            "password": "Password",
            "sign_in": "Sign in",
            "signing_in": "Signing in…",
            "sign_out": "Sign out",
            "err_bad_credentials": "That email or password is not right",
            "err_offline": "You are not connected",
            "err_generic": "Something went wrong",
            "work_title": "Your work",
            "work_today": "Today",
            "work_next": "Next working day",
            "work_none_today": "Nothing assigned to you today. Ask your supervisor if that seems wrong.",
            "work_none_next": "Nothing assigned for that day yet.",
            "work_weekend": "This is the weekly day off.",
            "work_holiday": "This is a public holiday.",
            "work_team": "Team job",
            "work_solo": "Individual",
            "work_with": "With",
            "work_start": "Started",
            "work_finish": "Finished",
            "status_planned": "Planned",
            "status_in_progress": "In progress",
            "status_done": "Done",
            "status_blocked": "Blocked",
            "retry": "Try again",
        ],
    ]
}
