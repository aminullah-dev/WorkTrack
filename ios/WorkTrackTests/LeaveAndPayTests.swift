import XCTest
@testable import WorkTrack

/// Leave balances and payslips.
///
/// Both screens show numbers a worker checks against their own expectations,
/// so the arithmetic and the decoding are what matter — a wrong figure here
/// does not crash, it just quietly disagrees with their payslip.
final class LeaveAndPayTests: XCTestCase {

    // MARK: leave

    private func balance(
        entitled: Double, carried: Double = 0, used: Double, pending: Double
    ) -> LeaveBalance {
        LeaveBalance(
            id: "b1", leaveTypeId: "lt_annual", periodYear: 2026,
            entitledDays: entitled, accruedDays: 0, usedDays: used,
            carriedOverDays: carried, pendingDays: pending
        )
    }

    func testAvailableDaysCountsPendingAsAlreadySpent() {
        // The one that matters: a request awaiting a decision has not reduced
        // usedDays yet. Ignoring pendingDays would let somebody book the same
        // week twice and find out when the second one is refused.
        XCTAssertEqual(balance(entitled: 20, used: 2, pending: 3).availableDays, 15)
    }

    func testCarryOverIsAddedNotIgnored() {
        XCTAssertEqual(balance(entitled: 20, carried: 5, used: 2, pending: 0).availableDays, 23)
    }

    func testAnOverdrawnBalanceGoesNegativeRatherThanClampingToZero() {
        // Clamping would hide a real situation — somebody who has taken more
        // than they had — from the person it concerns most.
        XCTAssertEqual(balance(entitled: 5, used: 6, pending: 2).availableDays, -3)
    }

    func testDecodesTheServersLeaveBalance() throws {
        let json = """
        {"id":"emp_ahmad_lt_annual_2026","employeeId":"emp_ahmad",
         "leaveTypeId":"lt_annual","periodYear":2026,"entitledDays":20,
         "accruedDays":0,"usedDays":2,"carriedOverDays":0,"pendingDays":0,
         "updatedAt":"2026-09-08T16:57:09.202Z"}
        """
        let decoded = try JSONDecoder().decode(LeaveBalance.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.availableDays, 18)
    }

    func testOnlyAPendingRequestCanBeWithdrawn() throws {
        // Offering "withdraw" on a decided request would send a call the server
        // refuses, and imply the decision can be undone from here.
        for (status, cancellable) in [
            ("PENDING", true), ("APPROVED", false), ("REJECTED", false), ("CANCELLED", false),
        ] {
            let json = """
            {"id":"lr_1","leaveTypeId":"lt_annual","startDate":"2026-09-11",
             "endDate":"2026-09-13","days":3,"reason":"سفر","status":"\(status)",
             "decisionNote":null}
            """
            let request = try JSONDecoder().decode(LeaveRequest.self, from: Data(json.utf8))
            XCTAssertEqual(request.isCancellable, cancellable, "for \(status)")
        }
    }

    func testAnUnknownLeaveStatusDoesNotBreakTheList() throws {
        let json = """
        {"id":"lr_1","leaveTypeId":"lt_annual","startDate":"2026-09-11",
         "endDate":"2026-09-13","days":3,"reason":"x","status":"ESCALATED",
         "decisionNote":null}
        """
        let request = try JSONDecoder().decode(LeaveRequest.self, from: Data(json.utf8))
        XCTAssertEqual(request.status, .pending)
    }

    // MARK: payslips

    func testPayslipYearIsSolarHijriNotGregorian() {
        // routes/payslips.ts validates 1300–1500 and records that a Gregorian
        // range "rejected every request the app has ever made". Sending 2026
        // returns an empty list from a healthy server — which reads to a worker
        // as never having been paid.
        let year = AfghanCalendar.currentShamsiYear(
            now: AfghanCalendar.parseISODate("2026-09-08")!
        )
        XCTAssertEqual(year, 1405)
        XCTAssertTrue((1300...1500).contains(year))
    }

    func testEmployerCostIsNotADeductionFromTheWorker() throws {
        // The bug this exists to stop: treating anything-not-EARNING as a
        // deduction put the company's pension contribution in the worker's
        // column, so the deductions no longer summed to totalDeductions — which
        // on a payslip reads as having been underpaid.
        let json = """
        {"id":"p1","periodYear":1405,"periodMonth":6,"currency":"AFN",
         "gross":34500,"totalDeductions":2633.34,"net":31866.66,"incomeTax":1596.3,
         "workedDays":14,"paidLeaveDays":0,"lopDays":1,"status":"FINALIZED",
         "lines":[
          {"componentCode":"BASIC","componentName":"معاش اساسی","type":"EARNING","amount":28000},
          {"componentCode":"LOP","componentName":"کسر غیرحاضری","type":"DEDUCTION","amount":1037.04},
          {"componentCode":"TAX","componentName":"مالیهٔ معاش","type":"DEDUCTION","amount":1596.3},
          {"componentCode":"PENSION","componentName":"سهم کارفرما","type":"EMPLOYER_COST","amount":1400}]}
        """
        let slip = try JSONDecoder().decode(Payslip.self, from: Data(json.utf8))

        XCTAssertEqual(slip.employerCosts.map(\.componentCode), ["PENSION"])
        XCTAssertFalse(slip.deductions.contains { $0.componentCode == "PENSION" })

        // The column has to add up to the server's own total.
        let sum = slip.deductions.reduce(0) { $0 + $1.amount }
        XCTAssertEqual(sum, slip.totalDeductions, accuracy: 0.001)
    }

    func testAnUnknownLineTypeIsNotTreatedAsADeduction() throws {
        // Inventing a deduction is the one direction that must never happen by
        // accident.
        let json = """
        {"id":"p1","periodYear":1405,"periodMonth":6,"currency":"AFN","gross":1,
         "totalDeductions":0,"net":1,"incomeTax":0,"workedDays":null,
         "paidLeaveDays":null,"lopDays":null,"status":"FINALIZED",
         "lines":[{"componentCode":"X","componentName":"جدید","type":"SOMETHING_NEW","amount":5}]}
        """
        let slip = try JSONDecoder().decode(Payslip.self, from: Data(json.utf8))
        XCTAssertTrue(slip.deductions.isEmpty)
    }

    func testSplitsEarningsFromDeductions() throws {
        let json = """
        {"id":"p1","periodYear":1405,"periodMonth":6,"currency":"AFN",
         "gross":34500,"totalDeductions":2633.34,"net":31866.66,"incomeTax":1596.3,
         "workedDays":14,"paidLeaveDays":0,"lopDays":1,"status":"FINALIZED",
         "lines":[
           {"componentCode":"BASIC","componentName":"معاش اساسی","type":"EARNING","amount":28000},
           {"componentCode":"TAX","componentName":"مالیه","type":"DEDUCTION","amount":1596.3}]}
        """
        let slip = try JSONDecoder().decode(Payslip.self, from: Data(json.utf8))

        XCTAssertEqual(slip.earnings.map(\.componentCode), ["BASIC"])
        XCTAssertEqual(slip.deductions.map(\.componentCode), ["TAX"])
        XCTAssertEqual(slip.net, 31866.66)
        XCTAssertEqual(slip.lopDays, 1, "unpaid absence must survive decoding — people ask about it")
    }

    func testAPayslipWithNoLinesStillDecodes() throws {
        // The list endpoint is the same shape whether or not lines are present.
        let json = """
        {"id":"p1","periodYear":1405,"periodMonth":6,"currency":"AFN","gross":1,
         "totalDeductions":0,"net":1,"incomeTax":0,"workedDays":null,
         "paidLeaveDays":null,"lopDays":null,"status":"FINALIZED"}
        """
        let slip = try JSONDecoder().decode(Payslip.self, from: Data(json.utf8))
        XCTAssertTrue(slip.earnings.isEmpty)
    }

    // MARK: money

    func testMoneyIsLocalisedAndNamed() {
        let text = AfghanCalendar.money(31866.66, currency: "AFN", language: .dari)
        XCTAssertTrue(text.contains("افغانی"), text)
        XCTAssertFalse(text.contains("3"), "Latin digits in a Dari figure: \(text)")
    }

    func testWholeAmountsHaveNoDecimals() {
        // "۲۸٬۰۰۰ افغانی", not "۲۸٬۰۰۰٫۰۰".
        let text = AfghanCalendar.money(28000, currency: "AFN", language: .english)
        XCTAssertEqual(text, "28,000 AFN")
    }

    func testEnglishKeepsLatinDigits() {
        XCTAssertEqual(
            AfghanCalendar.money(1234.5, currency: "AFN", language: .english), "1,234.50 AFN"
        )
    }
}
