package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.model.ApprovalDecision
import javax.inject.Inject

class DecideLeaveRequestUseCase @Inject constructor(
    private val leaveRepository: LeaveRepository,
) {

    suspend operator fun invoke(
        requestId: String,
        decision: ApprovalDecision,
        note: String?,
    ): AppResult<Unit> {
        if (decision == ApprovalDecision.REJECT && note.isNullOrBlank()) {
            return AppResult.failure(
                AppError.Validation("A note is required when rejecting", mapOf("note" to "Required")),
            )
        }
        return leaveRepository.decide(requestId, decision, note?.trim()?.takeIf { it.isNotEmpty() })
    }
}
