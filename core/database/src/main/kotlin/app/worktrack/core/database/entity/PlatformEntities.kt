package app.worktrack.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.Instant

@Entity(
    tableName = "announcements",
    indices = [Index("publishedAt")],
)
data class AnnouncementEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val title: String,
    val body: String,
    val priority: String,
    val publishedAt: Instant,
    val expiresAt: Instant?,
    val createdByName: String?,
    val updatedAt: Instant,
)

/**
 * Pending mutation queue (the client half of the outbox pattern).
 * Drained FIFO per resource type by the sync engine; rows are deleted on ack.
 */
@Entity(
    tableName = "outbox_entries",
    indices = [Index(value = ["state", "queuedAt"]), Index("resourceType")],
)
data class OutboxEntryEntity(
    @PrimaryKey val id: String,
    val opType: String,
    val resourceType: String,
    val resourceId: String,
    val payloadJson: String,
    val idempotencyKey: String,
    val attempts: Int,
    val lastError: String?,
    val state: String,
    val queuedAt: Instant,
)

/** Per-resource-type delta cursor for incremental pull. */
@Entity(tableName = "sync_cursors")
data class SyncCursorEntity(
    @PrimaryKey val resourceType: String,
    val cursor: String,
    val lastSyncedAt: Instant,
)
