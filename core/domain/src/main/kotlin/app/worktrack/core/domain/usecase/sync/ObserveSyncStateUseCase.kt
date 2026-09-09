package app.worktrack.core.domain.usecase.sync

import app.worktrack.core.domain.repository.SyncRepository
import app.worktrack.core.model.SyncState
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObserveSyncStateUseCase @Inject constructor(
    private val syncRepository: SyncRepository,
) {
    operator fun invoke(): Flow<SyncState> = syncRepository.observeSyncState()
}
