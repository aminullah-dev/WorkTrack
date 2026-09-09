package app.worktrack.core.model

import java.time.Instant

enum class PayComponentType { EARNING, DEDUCTION, EMPLOYER_COST }

enum class PayslipStatus { DRAFT, FINALIZED, PAID }

data class PayslipLine(
    val componentCode: String,
    val componentName: String,
    val type: PayComponentType,
    val amount: Double,
)

data class Payslip(
    val id: String,
    val companyId: String,
    val runId: String,
    val employeeId: String,
    val periodYear: Int,
    val periodMonth: Int,
    val currency: String,
    val gross: Double,
    val totalDeductions: Double,
    val net: Double,
    val workedDays: Double,
    val paidLeaveDays: Double,
    val lopDays: Double,
    val overtimeMinutes: Int,
    val status: PayslipStatus,
    val pdfUrl: String?,
    val lines: List<PayslipLine>,
    val updatedAt: Instant,
)
