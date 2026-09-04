package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.model.LeaveRequest
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObservePendingApprovalsUseCase @Inject constructor(
    private val leaveRepository: LeaveRepository,
) {
    operator fun invoke(): Flow<List<LeaveRequest>> = leaveRepository.observePendingApprovals()
}
