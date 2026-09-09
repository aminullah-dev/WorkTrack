import Foundation

enum PunchType: String { case inbound = "IN", outbound = "OUT" }

/// A fence the company drew around a site.
struct Geofence: Codable, Identifiable, Equatable {
    let id: String
    let name: String?
    let latitude: Double
    let longitude: Double
    let radiusMeters: Double
    let active: Bool?

    var isActive: Bool { active ?? true }
}

/// What came back from a punch. `serverValidated` is the field that matters:
/// the server records a punch made outside the fence rather than refusing it,
/// and flags it — so the app must say so rather than showing a plain success.
struct PunchResult: Decodable, Equatable {
    let id: String
    let type: String
    let punchedAt: String
    let serverValidated: Bool?
    let invalidReason: String?
    let insideFence: Bool?

    var wasAccepted: Bool { serverValidated ?? true }
}

/// How the server classified a day.
///
/// The exact set the rest of the product uses — AttendanceDayStatus in
/// core/model/Attendance.kt. Spelling one of these by hand is how "WEEK_OFF"
/// ended up rendering raw on screen next to properly translated neighbours:
/// I had guessed "WEEKEND".
enum AttendanceDayStatus: String, Codable {
    case present = "PRESENT"
    case absent = "ABSENT"
    case halfDay = "HALF_DAY"
    case leave = "LEAVE"
    case holiday = "HOLIDAY"
    case weekOff = "WEEK_OFF"
    /// The day is not settled yet — punches are in but the projection has not
    /// been recomputed.
    case pending = "PENDING"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AttendanceDayStatus(rawValue: raw) ?? .pending
    }

    var label: String {
        switch self {
        case .present: return L.t("hist_present")
        case .absent: return L.t("hist_absent")
        case .halfDay: return L.t("hist_half_day")
        case .leave: return L.t("hist_on_leave")
        case .holiday: return L.t("hist_holiday")
        case .weekOff: return L.t("hist_weekend")
        case .pending: return L.t("hist_pending")
        }
    }

    /// Days the company never expected anybody in. A correction on one of
    /// these is still allowed — people do work on their day off — but it is
    /// not what the screen leads with.
    var isNonWorking: Bool { self == .weekOff || self == .holiday }
}

/// One day's attendance projection, as the server computes it.
struct AttendanceDay: Codable, Equatable {
    let date: String
    let status: AttendanceDayStatus?
    let firstInAt: String?
    let lastOutAt: String?
    let workedMinutes: Int?

    /// In if the day has an opening punch and no closing one after it.
    var isClockedIn: Bool { firstInAt != nil && lastOutAt == nil }
}

/// The envelope /v1/sync/pull returns.
struct SyncPage<T: Decodable>: Decodable {
    let items: [T]
}
