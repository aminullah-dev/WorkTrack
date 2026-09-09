package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.LeaveRepository
import javax.inject.Inject

class CancelLeaveRequestUseCase @Inject constructor(
    private val leaveRepository: LeaveRepository,
) {
    suspend operator fun invoke(requestId: String): AppResult<Unit> =
        leaveRepository.cancel(requestId)
}
