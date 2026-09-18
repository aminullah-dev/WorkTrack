package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.SyncState
import kotlinx.coroutines.flow.Flow

/**
 * The client sync engine: drains the outbox (push) then applies server deltas (pull).
 * Invoked by WorkManager; UI observes [observeSyncState] for health.
 */
interface SyncRepository {

    fun observeSyncState(): Flow<SyncState>

    /**
     * One full sync cycle: push pending outbox operations in FIFO order per
     * resource, then delta-pull every replicated resource type. Idempotent —
     * safe to call concurrently or repeatedly.
     */
    suspend fun syncNow(): AppResult<Unit>
}

/** Schedules sync work; implemented with WorkManager in :core:sync. */
interface SyncScheduler {

    /** Ensures the periodic background sync is registered (idempotent). */
    fun schedulePeriodicSync()

    /** Requests an expedited one-off sync, e.g. right after a punch. */
    fun requestImmediateSync()
}
