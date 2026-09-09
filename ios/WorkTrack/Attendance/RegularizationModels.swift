import Foundation

enum RegularizationStatus: String, Codable {
    case pending = "PENDING"
    case approved = "APPROVED"
    case rejected = "REJECTED"
    case cancelled = "CANCELLED"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = RegularizationStatus(rawValue: raw) ?? .pending
    }

    var label: String {
        switch self {
        case .pending: return L.t("leave_pending")
        case .approved: return L.t("leave_approved")
        case .rejected: return L.t("leave_rejected")
        case .cancelled: return L.t("leave_cancelled")
        }
    }
}

/// Asking a manager to correct one day.
///
/// The worker never edits the day himself: he says what the times should have
/// been and why, and somebody with the authority decides. The original punches
/// are never touched either way — the correction is a separate record, which is
/// what makes the history auditable rather than editable.
struct Regularization: Codable, Identifiable, Equatable {
    let id: String
    let date: String
    let requestedInAt: String?
    let requestedOutAt: String?
    let reason: String
    let status: RegularizationStatus
    let decisionNote: String?
}
