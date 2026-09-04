package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.common.geo.GeoDistance
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.Geofence
import javax.inject.Inject
import kotlinx.coroutines.flow.first

/**
 * Result of matching a device location against the company's active geofences.
 *
 * @property fencesConfigured false when the tenant has no active fences, in which
 *   case punching from anywhere is permitted (small businesses without offices).
 */
data class GeofenceEvaluation(
    val fencesConfigured: Boolean,
    val nearestFence: Geofence?,
    val distanceMeters: Double?,
    val insideFence: Boolean,
)

class EvaluateGeofenceUseCase @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
) {

    suspend operator fun invoke(
        latitude: Double,
        longitude: Double,
        accuracyMeters: Float?,
    ): GeofenceEvaluation {
        val fences = attendanceRepository.observeActiveGeofences().first()
        if (fences.isEmpty()) {
            return GeofenceEvaluation(
                fencesConfigured = false,
                nearestFence = null,
                distanceMeters = null,
                insideFence = false,
            )
        }

        val measured = fences
            .map { it to GeoDistance.meters(latitude, longitude, it.latitude, it.longitude) }

        // GPS accuracy is credited toward the fence: a reading whose error circle
        // overlaps the fence counts as inside, so poor urban GPS doesn't lock people out.
        val slack = accuracyMeters ?: 0f
        // Being inside ANY fence is enough. Judging only the closest centre shut
        // out someone standing well inside a large site because a small fence
        // happened to be centred nearer — mirrors the server's checkGeofence.
        val containing = measured
            .filter { (fence, d) -> d - slack <= fence.radiusMeters }
            .minByOrNull { (_, d) -> d }
        val (nearest, distance) = containing ?: measured.minBy { (_, d) -> d }

        return GeofenceEvaluation(
            fencesConfigured = true,
            nearestFence = nearest,
            distanceMeters = distance,
            insideFence = containing != null,
        )
    }
}
