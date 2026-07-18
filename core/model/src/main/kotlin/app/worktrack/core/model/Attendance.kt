package app.worktrack.core.model

import java.time.Instant
import java.time.LocalDate

enum class PunchType { IN, OUT }

enum class PunchMethod { GPS, QR, FACE, MANUAL, KIOSK }

/** A single clock event. Append-only: punches are never edited or deleted. */
data class AttendancePunch(
    val id: String,
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

enum class AttendanceDayStatus { PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY, WEEK_OFF, PENDING }

/** Server-computed daily projection; the client never derives payroll-relevant minutes. */
data class AttendanceDay(
    val id: String,
    val employeeId: String,
    val date: LocalDate,
    val shiftId: String?,
    val firstInAt: Instant?,
    val lastOutAt: Instant?,
    val workedMinutes: Int,
    val lateMinutes: Int,
    val earlyOutMinutes: Int,
    val overtimeMinutes: Int,
    val status: AttendanceDayStatus,
)

/**
 * Input for the punch use case, built by the punch screen. Geofence fields are
 * stamped by the use case after evaluation; the server re-validates regardless.
 */
data class PunchCommand(
    val type: PunchType,
    val method: PunchMethod,
    val latitude: Double?,
    val longitude: Double?,
    val accuracyMeters: Float?,
    val isMockLocation: Boolean,
    val geofenceId: String? = null,
    val insideFence: Boolean = false,
    val kioskToken: String? = null,
    val note: String? = null,
    /** Base64 JPEG check-in selfie captured when photo-verified attendance is on. */
    val selfie: String? = null,
    val faceVerified: Boolean = false,
)

/**
 * Employee-filed request to correct a day's clock-in/out. At least one of the
 * two instants must be present. Filed offline-first; a manager approves it in
 * the web portal and the corrected day flows back through the normal sync pull.
 */
data class RegularizationCommand(
    val date: LocalDate,
    val requestedInAt: Instant?,
    val requestedOutAt: Instant?,
    val reason: String,
)

/** Live view of "where the user stands right now" for dashboard + punch screen. */
data class TodayAttendance(
    val date: LocalDate,
    val clockedIn: Boolean,
    val firstInAt: Instant?,
    val lastPunchAt: Instant?,
    val punchCount: Int,
    val workedMinutesSoFar: Int,
    val shift: Shift?,
)
