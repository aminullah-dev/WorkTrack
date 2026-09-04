package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.Geofence
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.RegularizationCommand
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

    /**
     * Files an attendance-correction request offline-first (outbox + immediate
     * sync). A manager approves it in the portal; the corrected day arrives back
     * through the normal attendance pull. Server re-validates on sync.
     */
    suspend fun requestRegularization(command: RegularizationCommand): AppResult<Unit>

    /** Pulls the given window of attendance days/punches from the server into Room. */
    suspend fun refresh(from: LocalDate, to: LocalDate): AppResult<Unit>
}
