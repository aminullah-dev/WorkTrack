package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.Geofence
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.TodayAttendance
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

interface AttendanceRepository {

    /** Live view of the current day: punches so far, clocked-in state, today's shift. */
    fun observeToday(): Flow<TodayAttendance>

    fun observeDays(from: LocalDate, to: LocalDate): Flow<List<AttendanceDay>>

    fun observePunches(from: LocalDate, to: LocalDate): Flow<List<AttendancePunch>>

    fun observeActiveGeofences(): Flow<List<Geofence>>

    /**
     * Records a punch offline-first: persists locally with PENDING sync status,
     * enqueues an outbox operation, and requests an immediate sync. Never blocks
     * on the network — server validation results reconcile asynchronously.
     */
    suspend fun punch(command: PunchCommand): AppResult<AttendancePunch>

    /** Pulls the given window of attendance days/punches from the server into Room. */
    suspend fun refresh(from: LocalDate, to: LocalDate): AppResult<Unit>
}
