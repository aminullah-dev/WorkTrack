package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.Geofence
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.TodayAttendance
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EvaluateGeofenceUseCaseTest {

    private class FakeAttendanceRepository(
        private val fences: List<Geofence>,
    ) : AttendanceRepository {
        override fun observeToday(): Flow<TodayAttendance> = emptyFlow()
        override fun observeDays(from: LocalDate, to: LocalDate): Flow<List<AttendanceDay>> = emptyFlow()
        override fun observePunches(from: LocalDate, to: LocalDate): Flow<List<AttendancePunch>> = emptyFlow()
        override fun observeActiveGeofences(): Flow<List<Geofence>> = flowOf(fences)
        override suspend fun punch(command: PunchCommand): AppResult<AttendancePunch> =
            error("not used in this test")
        override suspend fun refresh(from: LocalDate, to: LocalDate): AppResult<Unit> =
            AppResult.success(Unit)
    }

    private fun fence(id: String, lat: Double, lng: Double, radius: Int) = Geofence(
        id = id,
        companyId = "c1",
        branchId = "b1",
        name = "HQ",
        latitude = lat,
        longitude = lng,
        radiusMeters = radius,
        active = true,
        updatedAt = Instant.EPOCH,
    )

    @Test
    fun `no fences configured permits punching anywhere`() = runTest {
        val useCase = EvaluateGeofenceUseCase(FakeAttendanceRepository(emptyList()))
        val result = useCase(34.5553, 69.2075, accuracyMeters = 10f)
        assertFalse(result.fencesConfigured)
        assertFalse(result.insideFence)
    }

    @Test
    fun `inside radius is detected`() = runTest {
        val useCase = EvaluateGeofenceUseCase(
            FakeAttendanceRepository(listOf(fence("f1", 34.5553, 69.2075, radius = 150))),
        )
        // ~55m east of the fence center at this latitude.
        val result = useCase(34.5553, 69.2081, accuracyMeters = 5f)
        assertTrue(result.insideFence)
        assertEquals("f1", result.nearestFence?.id)
    }

    @Test
    fun `far outside radius is rejected`() = runTest {
        val useCase = EvaluateGeofenceUseCase(
            FakeAttendanceRepository(listOf(fence("f1", 34.5553, 69.2075, radius = 100))),
        )
        // ~1.1km away.
        val result = useCase(34.5553, 69.2195, accuracyMeters = 5f)
        assertFalse(result.insideFence)
    }

    @Test
    fun `gps accuracy is credited toward the fence`() = runTest {
        val useCase = EvaluateGeofenceUseCase(
            FakeAttendanceRepository(listOf(fence("f1", 34.5553, 69.2075, radius = 100))),
        )
        // ~155m out, but a 60m error circle overlaps the fence.
        val result = useCase(34.5553, 69.2092, accuracyMeters = 60f)
        assertTrue(result.insideFence)
    }

    @Test
    fun `nearest of multiple fences wins`() = runTest {
        val useCase = EvaluateGeofenceUseCase(
            FakeAttendanceRepository(
                listOf(
                    fence("far", 34.60, 69.30, radius = 100),
                    fence("near", 34.5553, 69.2075, radius = 100),
                ),
            ),
        )
        val result = useCase(34.5554, 69.2076, accuracyMeters = 5f)
        assertEquals("near", result.nearestFence?.id)
        assertTrue(result.insideFence)
    }
}
