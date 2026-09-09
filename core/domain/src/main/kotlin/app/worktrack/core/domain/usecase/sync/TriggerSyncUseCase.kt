package app.worktrack.core.domain.usecase.sync

import app.worktrack.core.domain.repository.SyncScheduler
import javax.inject.Inject

class TriggerSyncUseCase @Inject constructor(
    private val syncScheduler: SyncScheduler,
) {
    operator fun invoke() = syncScheduler.requestImmediateSync()
}
