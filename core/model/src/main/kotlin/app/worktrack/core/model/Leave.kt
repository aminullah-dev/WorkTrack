package app.worktrack.core.model

import java.time.Instant
import java.time.LocalDate

data class LeaveType(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val colorHex: String,
    val isPaid: Boolean,
    val requiresAttachment: Boolean,
    val active: Boolean,
    val updatedAt: Instant,
)

data class LeaveBalance(
    val id: String,
    val employeeId: String,
    val leaveTypeId: String,
    val periodYear: Int,
    val entitledDays: Double,
    val accruedDays: Double,
    val usedDays: Double,
    val carriedOverDays: Double,
    val pendingDays: Double,
    val updatedAt: Instant,
) {
    val availableDays: Double
        get() = entitledDays + accruedDays + carriedOverDays - usedDays - pendingDays
}

enum class LeaveStatus { DRAFT, PENDING, APPROVED, REJECTED, CANCELLED }

data class LeaveRequest(
    val id: String,
    val companyId: String,
    val employeeId: String,
    val employeeName: String?,
    val leaveTypeId: String,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val startHalfDay: Boolean,
    val endHalfDay: Boolean,
    val days: Double,
    val reason: String,
    val status: LeaveStatus,
    val currentApproverId: String?,
    val decidedAt: Instant?,
    val decisionNote: String?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val syncStatus: SyncStatus,
)

enum class ApprovalDecision { APPROVE, REJECT }

/** Input for the apply-leave use case. */
data class LeaveApplication(
    val leaveTypeId: String,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val startHalfDay: Boolean,
    val endHalfDay: Boolean,
    val reason: String,
)

data class Holiday(
    val id: String,
    val calendarId: String,
    val date: LocalDate,
    val name: String,
    val isOptional: Boolean,
)
