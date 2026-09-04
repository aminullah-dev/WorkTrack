package app.worktrack.core.data.sync

import app.worktrack.core.common.id.Ulid
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.database.dao.OutboxDao
import app.worktrack.core.database.entity.OutboxEntryEntity
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
    }
}
