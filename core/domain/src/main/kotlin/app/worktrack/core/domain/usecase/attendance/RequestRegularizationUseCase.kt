package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.onSuccess
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.model.RegularizationCommand
import javax.inject.Inject

/**
 * Client-side gate for filing an attendance correction. The server is
 * authoritative and re-validates on sync; these checks fail fast with
 * actionable feedback while the employee is still on the form.
 */
class RequestRegularizationUseCase @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
    private val timeProvider: TimeProvider,
    private val syncScheduler: SyncScheduler,
) {

    suspend operator fun invoke(command: RegularizationCommand): AppResult<Unit> {
        val fieldErrors = buildMap {
            if (command.requestedInAt == null && command.requestedOutAt == null) {
                put("times", "Provide a corrected check-in or check-out time")
            }
            if (command.reason.isBlank()) put("reason", "A reason is required")
            if (command.date.isAfter(timeProvider.today())) {
                put("date", "Cannot correct a future date")
            }
        }
        if (fieldErrors.isNotEmpty()) {
            return AppResult.failure(AppError.Validation("Fix the highlighted fields", fieldErrors))
        }

        val inAt = command.requestedInAt
        val outAt = command.requestedOutAt
        if (inAt != null && outAt != null && !outAt.isAfter(inAt)) {
            return AppResult.failure(
                AppError.Validation(
                    "Check-out must be after check-in",
                    mapOf("times" to "Check-out must be after check-in"),
                ),
            )
        }

        return attendanceRepository.requestRegularization(command)
            .onSuccess { syncScheduler.requestImmediateSync() }
    }
}
