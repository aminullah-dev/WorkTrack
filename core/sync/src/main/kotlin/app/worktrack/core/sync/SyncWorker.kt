package app.worktrack.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.isRetryable
import app.worktrack.core.domain.repository.SyncRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Executes one sync cycle (outbox push + delta pull). WorkManager provides the
 * network constraint, exponential backoff, and process-death survival; the
 * engine itself is idempotent, so overlapping schedules are harmless.
 */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val syncRepository: SyncRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = when (val result = syncRepository.syncNow()) {
        is AppResult.Success -> Result.success()
        is AppResult.Failure ->
            if (result.error.isRetryable && runAttemptCount < MAX_RETRIES) {
                Result.retry()
            } else {
                // Terminal for this run; the periodic schedule (or the next
                // user action) picks it up again. Failed ops stay visible in
                // the outbox and Profile sync status.
                Result.failure()
            }
    }

    companion object {
        const val MAX_RETRIES = 5
    }
}
