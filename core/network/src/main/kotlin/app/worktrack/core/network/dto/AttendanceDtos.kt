package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import app.worktrack.core.network.serializer.LocalDateSerializer
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.Serializable

/** Client -> server punch payload (also the outbox payload for punch ops). */
@Serializable
data class PunchCreateDto(
    val id: String, // client-generated ULID; doubles as the idempotency scope
    @Serializable(InstantSerializer::class) val punchedAt: Instant,
    val type: String,
    val method: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyMeters: Float? = null,
    val geofenceId: String? = null,
    val insideFence: Boolean = false,
    val kioskToken: String? = null,
    val note: String? = null,
    /** Optional check-in selfie (small base64 JPEG) for photo-verified attendance. */
    val selfie: String? = null,
    val faceVerified: Boolean = false,
)

@Serializable
data class PunchDto(
    val id: String,
    val companyId: String,
    val employeeId: String,
    @Serializable(InstantSerializer::class) val punchedAt: Instant,
    val type: String,
    val method: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyMeters: Float? = null,
    val geofenceId: String? = null,
    val insideFence: Boolean = false,
    val note: String? = null,
    val serverValidated: Boolean = false,
    val invalidReason: String? = null,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class AttendanceDayDto(
    val id: String,
    val employeeId: String,
    @Serializable(LocalDateSerializer::class) val date: LocalDate,
    val shiftId: String? = null,
    @Serializable(InstantSerializer::class) val firstInAt: Instant? = null,
    @Serializable(InstantSerializer::class) val lastOutAt: Instant? = null,
    val workedMinutes: Int = 0,
    val lateMinutes: Int = 0,
    val earlyOutMinutes: Int = 0,
    val overtimeMinutes: Int = 0,
    val status: String,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)
