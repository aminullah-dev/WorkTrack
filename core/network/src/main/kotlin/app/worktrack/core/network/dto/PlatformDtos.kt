package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class AnnouncementDto(
    val id: String,
    val companyId: String,
    val title: String,
    val body: String,
    val priority: String = "NORMAL",
    @Serializable(InstantSerializer::class) val publishedAt: Instant,
    @Serializable(InstantSerializer::class) val expiresAt: Instant? = null,
    val createdByName: String? = null,
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

/** One queued mutation from the client outbox. */
@Serializable
data class SyncOpDto(
    val opId: String,
    val opType: String, // CREATE | UPDATE | DELETE
    val resourceType: String, // punches | leaveRequests | ...
    val resourceId: String,
    val idempotencyKey: String,
    val payload: JsonObject,
)

@Serializable
data class SyncPushRequestDto(
    val ops: List<SyncOpDto>,
)

/** Per-op outcome; APPLIED covers idempotent replays of already-applied ops. */
@Serializable
data class SyncOpResultDto(
    val opId: String,
    val status: String, // APPLIED | REJECTED
    val errorCode: String? = null,
    val message: String? = null,
    val resource: JsonObject? = null,
)

@Serializable
data class SyncPushResponseDto(
    val results: List<SyncOpResultDto>,
)

/** Delta page for one resource type. Items are raw documents mapped per type. */
@Serializable
data class SyncPullResponseDto(
    val resourceType: String,
    val items: List<JsonObject> = emptyList(),
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
)
