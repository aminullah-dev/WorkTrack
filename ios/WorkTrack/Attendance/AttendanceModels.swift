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

/// One day's attendance projection, as the server computes it.
struct AttendanceDay: Codable, Equatable {
    let date: String
    let status: String?
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
