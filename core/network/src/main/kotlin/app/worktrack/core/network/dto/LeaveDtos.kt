package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import app.worktrack.core.network.serializer.LocalDateSerializer
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.Serializable

@Serializable
data class LeaveTypeDto(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val colorHex: String = "#607D8B",
    val isPaid: Boolean = true,
    val requiresAttachment: Boolean = false,
    val active: Boolean = true,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class LeaveBalanceDto(
    val id: String,
    val employeeId: String,
    val leaveTypeId: String,
    val periodYear: Int,
    val entitledDays: Double = 0.0,
    val accruedDays: Double = 0.0,
    val usedDays: Double = 0.0,
    val carriedOverDays: Double = 0.0,
    val pendingDays: Double = 0.0,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

/** Client -> server leave request payload (also the outbox payload). */
@Serializable
data class LeaveRequestCreateDto(
    val id: String, // client-generated ULID
    val leaveTypeId: String,
    @Serializable(LocalDateSerializer::class) val startDate: LocalDate,
    @Serializable(LocalDateSerializer::class) val endDate: LocalDate,
    val startHalfDay: Boolean = false,
    val endHalfDay: Boolean = false,
    val reason: String,
)

@Serializable
data class LeaveRequestDto(
    val id: String,
    val companyId: String,
    val employeeId: String,
    val employeeName: String? = null,
    val leaveTypeId: String,
    @Serializable(LocalDateSerializer::class) val startDate: LocalDate,
    @Serializable(LocalDateSerializer::class) val endDate: LocalDate,
    val startHalfDay: Boolean = false,
    val endHalfDay: Boolean = false,
    val days: Double,
    val reason: String,
    val status: String,
    val currentApproverId: String? = null,
    @Serializable(InstantSerializer::class) val decidedAt: Instant? = null,
    val decisionNote: String? = null,
    @Serializable(InstantSerializer::class) val createdAt: Instant,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class LeaveDecisionDto(
    val decision: String, // APPROVE | REJECT
    val note: String? = null,
)
