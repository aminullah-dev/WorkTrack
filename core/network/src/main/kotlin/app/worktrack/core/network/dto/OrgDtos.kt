package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import app.worktrack.core.network.serializer.LocalDateSerializer
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.Serializable

@Serializable
data class BranchDto(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val address: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val radiusMeters: Int? = null,
    val timezone: String,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class GeofenceDto(
    val id: String,
    val companyId: String,
    val branchId: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Int,
    val active: Boolean,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class EmployeeDto(
    val id: String,
    val companyId: String,
    val employeeCode: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String? = null,
    val avatarUrl: String? = null,
    val branchId: String? = null,
    val departmentId: String? = null,
    val positionId: String? = null,
    val managerId: String? = null,
    val employmentType: String,
    @Serializable(LocalDateSerializer::class) val joinDate: LocalDate,
    val status: String,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class ShiftDto(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val startTime: String, // "HH:mm"
    val endTime: String,
    val breakMinutes: Int,
    val graceInMinutes: Int,
    val graceOutMinutes: Int,
    val isNightShift: Boolean,
    val active: Boolean,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class ShiftAssignmentDto(
    val id: String,
    val companyId: String,
    val employeeId: String,
    val shiftId: String,
    @Serializable(LocalDateSerializer::class) val date: LocalDate,
    val branchId: String? = null,
    val source: String,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)
