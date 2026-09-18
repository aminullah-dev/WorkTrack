package app.worktrack.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import app.worktrack.core.model.LeaveStatus
import app.worktrack.core.model.SyncStatus
import java.time.Instant
import java.time.LocalDate

@Entity(tableName = "leave_types")
data class LeaveTypeEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val colorHex: String,
    val isPaid: Boolean,
    val requiresAttachment: Boolean,
    val active: Boolean,
    val updatedAt: Instant,
)

@Entity(
    tableName = "leave_balances",
    indices = [Index(value = ["employeeId", "leaveTypeId", "periodYear"], unique = true)],
)
data class LeaveBalanceEntity(
    @PrimaryKey val id: String,
    val employeeId: String,
    val leaveTypeId: String,
    val periodYear: Int,
    val entitledDays: Double,
    val accruedDays: Double,
    val usedDays: Double,
    val carriedOverDays: Double,
    val pendingDays: Double,
    val updatedAt: Instant,
)

@Entity(
    tableName = "leave_requests",
    indices = [
        Index(value = ["employeeId", "startDate"]),
        Index("status"),
        Index("currentApproverId"),
    ],
)
data class LeaveRequestEntity(
    @PrimaryKey val id: String,
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
