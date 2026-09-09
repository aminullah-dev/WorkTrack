package app.worktrack.core.data.sync

import app.worktrack.core.common.id.Ulid
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.database.dao.OutboxDao
import app.worktrack.core.database.entity.OutboxEntryEntity
import app.worktrack.core.domain.repository.SyncScheduler
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single entry point for queueing offline mutations. Every enqueued operation
 * carries a fresh ULID idempotency key so server-side replays are detectable.
 */
@Singleton
class OutboxWriter @Inject constructor(
    private val outboxDao: OutboxDao,
    private val timeProvider: TimeProvider,
    private val syncScheduler: SyncScheduler,
) {

    suspend fun enqueue(
        opType: String,
        resourceType: String,
        resourceId: String,
        payloadJson: String,
    ) {
        outboxDao.insert(
            OutboxEntryEntity(
                id = Ulid.generate(),
                opType = opType,
                resourceType = resourceType,
                resourceId = resourceId,
                payloadJson = payloadJson,
                idempotencyKey = Ulid.generate(),
                attempts = 0,
                lastError = null,
                state = "PENDING",
                queuedAt = timeProvider.now(),
            ),
        )
        // Push immediately so a punch (or any mutation) reaches the server right
        // away instead of waiting for the ~15-min periodic sync window. The
        // scheduler de-dupes concurrent requests (APPEND_OR_REPLACE).
        syncScheduler.requestImmediateSync()
    }
}
