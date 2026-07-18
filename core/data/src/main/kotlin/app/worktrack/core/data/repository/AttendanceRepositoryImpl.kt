package app.worktrack.core.data.repository

import app.worktrack.core.common.id.Ulid
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.data.mapper.toEntity
import app.worktrack.core.data.mapper.toModel
import app.worktrack.core.data.sync.OutboxOpTypes
import app.worktrack.core.data.sync.OutboxWriter
import app.worktrack.core.data.sync.ResourceTypes
import app.worktrack.core.database.dao.AttendanceDao
import app.worktrack.core.database.dao.OrgDao
import app.worktrack.core.database.dao.ShiftDao
import app.worktrack.core.database.entity.AttendancePunchEntity
import app.worktrack.core.datastore.SessionStore
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.Geofence
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.PunchType
import app.worktrack.core.model.RegularizationCommand
import app.worktrack.core.model.SyncStatus
import app.worktrack.core.model.TodayAttendance
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import app.worktrack.core.network.dto.PunchCreateDto
import app.worktrack.core.network.dto.RegularizationCreateDto
import java.time.Duration
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

@Singleton
class AttendanceRepositoryImpl @Inject constructor(
    private val attendanceDao: AttendanceDao,
    private val shiftDao: ShiftDao,
    private val orgDao: OrgDao,
    private val sessionStore: SessionStore,
    private val outboxWriter: OutboxWriter,
    private val api: WorkTrackApi,
    private val timeProvider: TimeProvider,
    private val json: Json,
) : AttendanceRepository {

    override fun observeToday(): Flow<TodayAttendance> =
        sessionStore.session.flatMapLatest { session ->
            val today = timeProvider.today()
            if (session == null) {
                flowOf(emptyToday(today))
            } else {
                val zone = timeProvider.zone()
                val dayStart = today.atStartOfDay(zone).toInstant()
                val dayEnd = today.plusDays(1).atStartOfDay(zone).toInstant()
                combine(
                    attendanceDao.observePunchesBetween(session.employeeId, dayStart, dayEnd),
                    shiftDao.observeShiftForDate(session.employeeId, today),
                ) { punches, shift ->
                    val ordered = punches.sortedBy { it.punchedAt }
                    TodayAttendance(
                        date = today,
                        clockedIn = ordered.lastOrNull()?.type == PunchType.IN,
                        firstInAt = ordered.firstOrNull { it.type == PunchType.IN }?.punchedAt,
                        lastPunchAt = ordered.lastOrNull()?.punchedAt,
                        punchCount = ordered.size,
                        workedMinutesSoFar = closedPairMinutes(ordered),
                        shift = shift?.toModel(),
                    )
                }
            }
        }

    override fun observeDays(from: LocalDate, to: LocalDate): Flow<List<AttendanceDay>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null) {
                flowOf(emptyList())
            } else {
                attendanceDao.observeDaysBetween(session.employeeId, from, to)
                    .map { days -> days.map { it.toModel() } }
            }
        }

    override fun observePunches(from: LocalDate, to: LocalDate): Flow<List<AttendancePunch>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null) {
                flowOf(emptyList())
            } else {
                val zone = timeProvider.zone()
                attendanceDao.observePunchesBetween(
                    employeeId = session.employeeId,
                    from = from.atStartOfDay(zone).toInstant(),
                    to = to.plusDays(1).atStartOfDay(zone).toInstant(),
                ).map { punches -> punches.map { it.toModel() } }
            }
        }

    override fun observeActiveGeofences(): Flow<List<Geofence>> =
        orgDao.observeActiveGeofences().map { fences -> fences.map { it.toModel() } }

    override suspend fun punch(command: PunchCommand): AppResult<AttendancePunch> {
        val session = sessionStore.session.first()
            ?: return AppResult.failure(AppError.Unauthenticated)

        val entity = AttendancePunchEntity(
            id = Ulid.generate(timeProvider.now().toEpochMilli()),
            companyId = session.companyId,
            employeeId = session.employeeId,
            punchedAt = timeProvider.now(),
            type = command.type,
            method = command.method,
            latitude = command.latitude,
            longitude = command.longitude,
            accuracyMeters = command.accuracyMeters,
            geofenceId = command.geofenceId,
            insideFence = command.insideFence,
            note = command.note,
            serverValidated = false,
            invalidReason = null,
            syncStatus = SyncStatus.PENDING,
        )
        attendanceDao.insertPunch(entity)

        val payload = PunchCreateDto(
            id = entity.id,
            punchedAt = entity.punchedAt,
            type = entity.type.name,
            method = entity.method.name,
            latitude = entity.latitude,
            longitude = entity.longitude,
            accuracyMeters = entity.accuracyMeters,
            geofenceId = entity.geofenceId,
            insideFence = entity.insideFence,
            kioskToken = command.kioskToken,
            note = entity.note,
            selfie = command.selfie,
            faceVerified = command.faceVerified,
        )
        outboxWriter.enqueue(
            opType = OutboxOpTypes.CREATE,
            resourceType = ResourceTypes.PUNCHES,
            resourceId = entity.id,
            payloadJson = json.encodeToString(PunchCreateDto.serializer(), payload),
        )
        return AppResult.success(entity.toModel())
    }

    override suspend fun requestRegularization(
        command: RegularizationCommand,
    ): AppResult<Unit> {
        // Require an authenticated session; the server stamps company/employee
        // from the auth token when the outbox op is pushed.
        sessionStore.session.first()
            ?: return AppResult.failure(AppError.Unauthenticated)

        val id = Ulid.generate(timeProvider.now().toEpochMilli())
        val payload = RegularizationCreateDto(
            id = id,
            date = command.date,
            requestedInAt = command.requestedInAt,
            requestedOutAt = command.requestedOutAt,
            reason = command.reason.trim(),
        )
        outboxWriter.enqueue(
            opType = OutboxOpTypes.CREATE,
            resourceType = ResourceTypes.REGULARIZATIONS,
            resourceId = id,
            payloadJson = json.encodeToString(RegularizationCreateDto.serializer(), payload),
        )
        return AppResult.success(Unit)
    }

    override suspend fun refresh(from: LocalDate, to: LocalDate): AppResult<Unit> =
        apiCall { api.attendanceDays(from.toString(), to.toString()) }
            .map { envelope ->
                attendanceDao.upsertDays(envelope.data.map { it.toEntity() })
            }

    private fun emptyToday(today: LocalDate) = TodayAttendance(
        date = today,
        clockedIn = false,
        firstInAt = null,
        lastPunchAt = null,
        punchCount = 0,
        workedMinutesSoFar = 0,
        shift = null,
    )

    /** Sums completed IN→OUT intervals; an open IN is counted live by the UI clock. */
    private fun closedPairMinutes(ordered: List<AttendancePunchEntity>): Int {
        var total = 0L
        var openIn: AttendancePunchEntity? = null
        for (punch in ordered) {
            when (punch.type) {
                PunchType.IN -> if (openIn == null) openIn = punch
                PunchType.OUT -> openIn?.let {
                    total += Duration.between(it.punchedAt, punch.punchedAt).toMinutes()
                    openIn = null
                }
            }
        }
        return total.toInt()
    }
}
