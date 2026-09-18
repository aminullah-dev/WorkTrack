package app.worktrack.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.Instant

@Entity(tableName = "branches")
data class BranchEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val address: String?,
    val latitude: Double?,
    val longitude: Double?,
    val radiusMeters: Int?,
    val timezone: String,
    val updatedAt: Instant,
)

@Entity(
    tableName = "geofences",
    indices = [Index("branchId"), Index("active")],
)
data class GeofenceEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val branchId: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Int,
    val active: Boolean,
    val updatedAt: Instant,
)

@Entity(
    tableName = "employees",
    indices = [Index("branchId"), Index("managerId")],
)
data class EmployeeEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val employeeCode: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String?,
    val avatarUrl: String?,
    val branchId: String?,
    val departmentId: String?,
    val positionId: String?,
    val managerId: String?,
    val employmentType: String,
    val joinDateEpochDay: Long,
    val status: String,
    val updatedAt: Instant,
)
