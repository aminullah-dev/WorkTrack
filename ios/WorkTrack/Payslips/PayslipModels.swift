import Foundation

/// A payslip line is one of THREE things, not two.
///
/// EMPLOYER_COST is what the company pays on top — pension, for instance. It
/// is not taken from the worker, and treating anything-not-EARNING as a
/// deduction put it in the wrong column: the deductions then did not add up to
/// the total, which on a payslip reads as having been underpaid.
enum PayslipLineType: String, Codable {
    case earning = "EARNING"
    case deduction = "DEDUCTION"
    case employerCost = "EMPLOYER_COST"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        // An unknown type is NOT assumed to be a deduction — inventing a
        // deduction is the one direction that must never happen by accident.
        self = PayslipLineType(rawValue: raw) ?? .earning
    }
}

struct PayslipLine: Codable, Identifiable, Equatable {
    let componentCode: String
    let componentName: String
    let type: PayslipLineType
    let amount: Double

    var id: String { componentCode }
    var isEarning: Bool { type == .earning }
}

/// One month's pay.
///
/// `periodYear` is a SOLAR HIJRI year — payroll writes 1405, not 2026 — and the
/// endpoint validates the range, so asking with a Gregorian year returns
/// nothing at all. The comment in routes/payslips.ts records that this had
/// already been got wrong once.
struct Payslip: Codable, Identifiable, Equatable {
    let id: String
    let periodYear: Int
    let periodMonth: Int
    let currency: String
    let gross: Double
    let totalDeductions: Double
    let net: Double
    let incomeTax: Double
    let workedDays: Double?
    let paidLeaveDays: Double?
    let lopDays: Double?
    let status: String
    let lines: [PayslipLine]?

    var earnings: [PayslipLine] { lines(of: .earning) }
    /// Only real deductions. These sum to `totalDeductions`, and a test holds
    /// that against the server's own figure.
    var deductions: [PayslipLine] { lines(of: .deduction) }
    /// What the company pays on top. Shown, because it is part of what the job
    /// costs and workers ask — but never mixed into what was taken from them.
    var employerCosts: [PayslipLine] { lines(of: .employerCost) }

    private func lines(of type: PayslipLineType) -> [PayslipLine] {
        (lines ?? []).filter { $0.type == type }
    }
}
