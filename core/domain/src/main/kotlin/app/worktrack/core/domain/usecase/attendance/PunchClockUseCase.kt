package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.onSuccess
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.PunchMethod
import javax.inject.Inject

/**
 * Client-side gate for recording a punch. The server re-validates everything;
 * these checks exist to fail fast with actionable feedback while offline.
 */
class PunchClockUseCase @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
    private val evaluateGeofence: EvaluateGeofenceUseCase,
    private val syncScheduler: SyncScheduler,
) {

    suspend operator fun invoke(command: PunchCommand): AppResult<AttendancePunch> {
        if (command.isMockLocation) {
            return AppResult.failure(
                AppError.Business(
                    code = "MOCK_LOCATION",
                    message = "Mock locations are not allowed for attendance",
                ),
            )
        }

        val enriched = when (command.method) {
            PunchMethod.GPS -> {
                val lat = command.latitude
                val lng = command.longitude
                if (lat == null || lng == null) {
                    return AppResult.failure(
                        AppError.Validation("A location fix is required for GPS punch"),
                    )
                }
                val evaluation = evaluateGeofence(lat, lng, command.accuracyMeters)
                if (evaluation.fencesConfigured && !evaluation.insideFence) {
                    return AppResult.failure(
                        AppError.Business(
                            code = "GEOFENCE_VIOLATION",
                            message = "You are outside the allowed work area" +
                                (evaluation.nearestFence?.let { " (${it.name})" } ?: ""),
                        ),
                    )
                }
                command.copy(
                    geofenceId = evaluation.nearestFence?.id,
                    insideFence = evaluation.insideFence,
                )
            }

            PunchMethod.QR -> {
                if (command.kioskToken.isNullOrBlank()) {
                    return AppResult.failure(
                        AppError.Validation("Kiosk QR token missing — rescan the code"),
                    )
                }
                command
            }

            else -> command
        }

        return attendanceRepository.punch(enriched)
            .onSuccess { syncScheduler.requestImmediateSync() }
    }
}
