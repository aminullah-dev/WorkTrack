package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.onSuccess
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.model.LeaveApplication
import app.worktrack.core.model.LeaveRequest
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import kotlinx.coroutines.flow.first

class ApplyLeaveUseCase @Inject constructor(
    private val leaveRepository: LeaveRepository,
    private val timeProvider: TimeProvider,
    private val syncScheduler: SyncScheduler,
) {

    suspend operator fun invoke(application: LeaveApplication): AppResult<LeaveRequest> {
        val fieldErrors = buildMap {
            if (application.endDate.isBefore(application.startDate)) {
                put("endDate", "End date must be on or after the start date")
            }
            if (application.reason.isBlank()) put("reason", "A reason is required")
            if (application.startDate.isBefore(timeProvider.today().minusDays(MAX_BACKDATE_DAYS))) {
                put("startDate", "Leave cannot start more than $MAX_BACKDATE_DAYS days in the past")
            }
        }
        if (fieldErrors.isNotEmpty()) {
            return AppResult.failure(AppError.Validation("Fix the highlighted fields", fieldErrors))
        }

        val days = calculateDays(application)
        if (days <= 0.0) {
            return AppResult.failure(AppError.Validation("The selected range is empty"))
        }

        // Best-effort local balance check for immediate feedback; the server holds
        // the authoritative balance and re-validates on sync.
        val balance = leaveRepository
            .observeMyBalances(application.startDate.year).first()
            .firstOrNull { it.leaveTypeId == application.leaveTypeId }
        if (balance != null && days > balance.availableDays) {
            return AppResult.failure(
                AppError.Business(
                    code = "INSUFFICIENT_LEAVE_BALANCE",
                    message = "Requested %.1f days but only %.1f available"
                        .format(days, balance.availableDays),
                ),
            )
        }

        return leaveRepository.apply(application)
            .onSuccess { syncScheduler.requestImmediateSync() }
    }

    companion object {
        private const val MAX_BACKDATE_DAYS = 30L

        /**
         * Calendar-day count with half-day adjustments. Weekend/holiday exclusion
         * depends on branch calendars and is applied server-side; this figure is
         * the client-side estimate shown before submission.
         */
        fun calculateDays(application: LeaveApplication): Double {
            val span = ChronoUnit.DAYS.between(application.startDate, application.endDate) + 1
            if (span <= 0) return 0.0
            if (isSingleDay(application.startDate, application.endDate)) {
                return if (application.startHalfDay || application.endHalfDay) 0.5 else 1.0
            }
            var days = span.toDouble()
            if (application.startHalfDay) days -= 0.5
            if (application.endHalfDay) days -= 0.5
            return days
        }

        private fun isSingleDay(start: LocalDate, end: LocalDate) = start == end
    }
}
