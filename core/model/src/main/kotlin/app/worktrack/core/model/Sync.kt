package app.worktrack.core.model

import java.time.Instant

/** Client-side replication status of a locally stored row. */
enum class SyncStatus { SYNCED, PENDING, FAILED }

/** Aggregate health of the sync engine, surfaced in Profile and debug UIs. */
data class SyncState(
    val isSyncing: Boolean,
    val pendingOperations: Int,
    val failedOperations: Int,
    val lastSuccessAt: Instant?,
    val lastError: String?,
)
