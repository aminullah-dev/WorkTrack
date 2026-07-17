package app.worktrack.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import app.worktrack.core.model.PunchMethod
import app.worktrack.core.model.PunchType
import app.worktrack.core.model.SyncStatus
import java.time.Instant
import java.time.LocalDate

/** Append-only local mirror of clock events. 90-day retention window on device. */
@Entity(
    tableName = "attendance_punches",
    indices = [
        Index(value = ["employeeId", "punchedAt"]),
        Index("syncStatus"),
    ],
)
data class AttendancePunchEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val employeeId: String,
    val punchedAt: Instant,
    val type: PunchType,
    val method: PunchMethod,
    val latitude: Double?,
    val longitude: Double?,
    val accuracyMeters: Float?,
    val geofenceId: String?,
    val insideFence: Boolean,
    val note: String?,
    val serverValidated: Boolean,
    val invalidReason: String?,
    val syncStatus: SyncStatus,
)

/** Server-computed daily summary; read-only on the client. */
@Entity(
    tableName = "attendance_days",
    indices = [Index(value = ["employeeId", "date"], unique = true)],
)
data class AttendanceDayEntity(
    @PrimaryKey val id: String,
    val employeeId: String,
    val date: LocalDate,
    val shiftId: String?,
    val firstInAt: Instant?,
    val lastOutAt: Instant?,
    val workedMinutes: Int,
    val lateMinutes: Int,
    val earlyOutMinutes: Int,
    val overtimeMinutes: Int,
    val status: String,
)

@Entity(tableName = "shifts")
data class ShiftEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val startTimeSecondOfDay: Int,
    val endTimeSecondOfDay: Int,
    val breakMinutes: Int,
    val graceInMinutes: Int,
    val graceOutMinutes: Int,
    val isNightShift: Boolean,
    val active: Boolean,
    val updatedAt: Instant,
)

@Entity(
    tableName = "shift_assignments",
    indices = [Index(value = ["employeeId", "date"], unique = true)],
)
data class ShiftAssignmentEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val employeeId: String,
    val shiftId: String,
    val date: LocalDate,
    val branchId: String?,
    val source: String,
    val updatedAt: Instant,
)
