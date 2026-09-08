import Foundation

struct LeaveType: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let code: String
    let colorHex: String?
    let isPaid: Bool?
}

/// One person's balance for one leave type, for one year.
///
/// `periodYear` here is GREGORIAN (2026), unlike a payslip's, which is Solar
/// Hijri (1405). That is the server's shape, not a choice made here — so the
/// year is never shown to the worker on this screen; the days are what matter.
struct LeaveBalance: Codable, Identifiable, Equatable {
    let id: String
    let leaveTypeId: String
    let periodYear: Int
    let entitledDays: Double
    let accruedDays: Double
    let usedDays: Double
    let carriedOverDays: Double
    let pendingDays: Double

    /// What is actually left to take: entitlement plus carry-over, less what
    /// has been used AND what is already waiting on a decision. Leaving
    /// pending days out would let somebody book the same days twice.
    var availableDays: Double {
        entitledDays + carriedOverDays - usedDays - pendingDays
    }
}

enum LeaveStatus: String, Codable {
    case pending = "PENDING"
    case approved = "APPROVED"
    case rejected = "REJECTED"
    case cancelled = "CANCELLED"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = LeaveStatus(rawValue: raw) ?? .pending
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

struct LeaveRequest: Codable, Identifiable, Equatable {
    let id: String
    let leaveTypeId: String
    let startDate: String
    let endDate: String
    let days: Double
    let reason: String
    let status: LeaveStatus
    let decisionNote: String?

    /// Only a request nobody has decided yet can be withdrawn.
    var isCancellable: Bool { status == .pending }
}
