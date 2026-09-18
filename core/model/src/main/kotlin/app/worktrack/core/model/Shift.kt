package app.worktrack.core.model

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

data class Shift(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val breakMinutes: Int,
    val graceInMinutes: Int,
    val graceOutMinutes: Int,
    val isNightShift: Boolean,
    val active: Boolean,
    val updatedAt: Instant,
)

enum class ShiftAssignmentSource { ROSTER, ROTATION, MANUAL, SWAP }

data class ShiftAssignment(
    val id: String,
    val companyId: String,
    val employeeId: String,
    val shiftId: String,
    val date: LocalDate,
    val branchId: String?,
    val source: ShiftAssignmentSource,
    val updatedAt: Instant,
)
