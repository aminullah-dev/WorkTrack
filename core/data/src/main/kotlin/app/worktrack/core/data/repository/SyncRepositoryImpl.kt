package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.data.mapper.toEntity
import app.worktrack.core.data.mapper.toLineEntities
import app.worktrack.core.data.sync.ResourceTypes
import app.worktrack.core.database.dao.AnnouncementDao
import app.worktrack.core.database.dao.AttendanceDao
import app.worktrack.core.database.dao.LeaveDao
import app.worktrack.core.database.dao.OrgDao
import app.worktrack.core.database.dao.OutboxDao
import app.worktrack.core.database.dao.PayslipDao
import app.worktrack.core.database.dao.ShiftDao
import app.worktrack.core.database.dao.SyncCursorDao
import app.worktrack.core.database.entity.OutboxEntryEntity
import app.worktrack.core.database.entity.SyncCursorEntity
import app.worktrack.core.datastore.SessionStore
import app.worktrack.core.domain.repository.SyncRepository
import app.worktrack.core.model.SyncState
import app.worktrack.core.model.SyncStatus
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import app.worktrack.core.network.dto.AnnouncementDto
import app.worktrack.core.network.dto.AttendanceDayDto
import app.worktrack.core.network.dto.BranchDto
import app.worktrack.core.network.dto.EmployeeDto
import app.worktrack.core.network.dto.GeofenceDto
import app.worktrack.core.network.dto.LeaveBalanceDto
import app.worktrack.core.network.dto.LeaveRequestDto
import app.worktrack.core.network.dto.LeaveTypeDto
import app.worktrack.core.network.dto.PayslipDto
import app.worktrack.core.network.dto.PunchDto
import app.worktrack.core.network.dto.ShiftAssignmentDto
import app.worktrack.core.network.dto.ShiftDto
import app.worktrack.core.network.dto.SyncOpDto
import app.worktrack.core.network.dto.SyncOpResultDto
import app.worktrack.core.network.dto.SyncPushRequestDto
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * The client sync engine.
 *
 * Push: drains the outbox in FIFO batches through POST /sync/push. Transport
 * failures requeue the batch untouched; per-op rejections are terminal and are
 * reflected onto the owning row (never silently dropped).
 *
 * Pull: per-resource-type delta cursors through GET /sync/pull, reference data
 * first. Cursors only advance after a page is fully applied, so a crash
 * mid-page replays idempotently (all appliers are upserts / insert-ignore).
 */
@Singleton
class SyncRepositoryImpl @Inject constructor(
    private val outboxDao: OutboxDao,
    private val syncCursorDao: SyncCursorDao,
    private val orgDao: OrgDao,
    private val shiftDao: ShiftDao,
    private val attendanceDao: AttendanceDao,
    private val leaveDao: LeaveDao,
    private val payslipDao: PayslipDao,
    private val announcementDao: AnnouncementDao,
    private val sessionStore: SessionStore,
    private val api: WorkTrackApi,
    private val timeProvider: TimeProvider,
    private val json: Json,
) : SyncRepository {

    private data class EngineState(
        val isSyncing: Boolean = false,
        val lastSuccessAt: Instant? = null,
        val lastError: String? = null,
    )

    private val mutex = Mutex()
    private val engineState = MutableStateFlow(EngineState())

    override fun observeSyncState(): Flow<SyncState> = combine(
        engineState,
        outboxDao.observePendingCount(),
        outboxDao.observeFailedCount(),
    ) { state, pending, failed ->
        SyncState(
            isSyncing = state.isSyncing,
            pendingOperations = pending,
            failedOperations = failed,
            lastSuccessAt = state.lastSuccessAt,
            lastError = state.lastError,
        )
    }

    override suspend fun syncNow(): AppResult<Unit> = mutex.withLock {
        if (sessionStore.session.first() == null) {
            return AppResult.success(Unit) // signed out: nothing to sync
        }
        engineState.update { it.copy(isSyncing = true) }

        val result = runSyncCycle()

        engineState.update {
            when (result) {
                is AppResult.Success -> EngineState(
                    isSyncing = false,
                    lastSuccessAt = timeProvider.now(),
                    lastError = null,
                )

                is AppResult.Failure -> it.copy(
                    isSyncing = false,
                    lastError = result.error.toShortMessage(),
                )
            }
        }
        result
    }

    private suspend fun runSyncCycle(): AppResult<Unit> {
        pushOutbox().let { if (it is AppResult.Failure) return it }
        pullDeltas().let { if (it is AppResult.Failure) return it }
        attendanceDao.prunePunchesBefore(timeProvider.now().minus(PUNCH_RETENTION))
        return AppResult.success(Unit)
    }

    // ------------------------------------------------------------------ push

    private suspend fun pushOutbox(): AppResult<Unit> {
        outboxDao.requeueInFlight() // recover from a previous process death

        while (true) {
            val batch = outboxDao.nextPending(PUSH_BATCH_SIZE)
            if (batch.isEmpty()) return AppResult.success(Unit)
            outboxDao.markInFlight(batch.map { it.id })

            val ops = batch.map { entry ->
                SyncOpDto(
                    opId = entry.id,
                    opType = entry.opType,
                    resourceType = entry.resourceType,
                    resourceId = entry.resourceId,
                    idempotencyKey = entry.idempotencyKey,
                    payload = json.parseToJsonElement(entry.payloadJson).jsonObject,
                )
            }

            when (val response = apiCall { api.syncPush(SyncPushRequestDto(ops)) }) {
                is AppResult.Failure -> {
                    // Transport-level failure: nothing was durably rejected.
                    outboxDao.requeueInFlight()
                    return response
                }

                is AppResult.Success -> {
                    val byId = batch.associateBy { it.id }
                    response.data.data.results.forEach { opResult ->
                        byId[opResult.opId]?.let { applyOpResult(it, opResult) }
                    }
                }
            }
        }
    }

    private suspend fun applyOpResult(entry: OutboxEntryEntity, result: SyncOpResultDto) {
        when (result.status) {
            "APPLIED" -> {
                applyServerEcho(entry, result.resource)
                outboxDao.delete(entry.id)
            }

            else -> {
                // Business rejection: terminal for this op. Keep the entry as
                // FAILED for observability and mark the owning row.
                applyRejection(entry, result)
                outboxDao.markAttemptFailed(
                    id = entry.id,
                    state = "FAILED",
                    error = result.errorCode ?: result.message,
                )
            }
        }
    }

    private suspend fun applyServerEcho(entry: OutboxEntryEntity, resource: JsonObject?) {
        when (entry.resourceType) {
            ResourceTypes.PUNCHES -> {
                val dto = resource?.let { json.decodeFromJsonElement(PunchDto.serializer(), it) }
                attendanceDao.updatePunchSyncResult(
                    id = entry.resourceId,
                    syncStatus = SyncStatus.SYNCED,
                    serverValidated = dto?.serverValidated ?: true,
                    invalidReason = dto?.invalidReason,
                )
            }

            ResourceTypes.LEAVE_REQUESTS -> {
                resource
                    ?.let { json.decodeFromJsonElement(LeaveRequestDto.serializer(), it) }
                    ?.let { leaveDao.upsertRequests(listOf(it.toEntity())) }
            }
        }
    }

    private suspend fun applyRejection(entry: OutboxEntryEntity, result: SyncOpResultDto) {
        val reason = result.errorCode ?: result.message ?: "REJECTED"
        when (entry.resourceType) {
            ResourceTypes.PUNCHES -> attendanceDao.updatePunchSyncResult(
                id = entry.resourceId,
                syncStatus = SyncStatus.FAILED,
                serverValidated = false,
                invalidReason = reason,
            )

            ResourceTypes.LEAVE_REQUESTS -> {
                leaveDao.requestById(entry.resourceId)?.let { existing ->
                    leaveDao.updateRequestStatus(
                        id = existing.id,
                        status = existing.status,
                        syncStatus = SyncStatus.FAILED,
                        updatedAt = timeProvider.now(),
                    )
                }
            }
        }
    }

    // ------------------------------------------------------------------ pull

    private suspend fun pullDeltas(): AppResult<Unit> {
        for (resourceType in ResourceTypes.pullOrder) {
            var cursor = syncCursorDao.cursor(resourceType)?.cursor
            while (true) {
                val page = when (val res = apiCall { api.syncPull(resourceType, cursor) }) {
                    is AppResult.Failure -> return res
                    is AppResult.Success -> res.data.data
                }

                if (page.items.isNotEmpty()) applyPulled(resourceType, page.items)

                val next = page.nextCursor
                if (next != null && next != cursor) {
                    cursor = next
                    syncCursorDao.upsert(
                        SyncCursorEntity(
                            resourceType = resourceType,
                            cursor = next,
                            lastSyncedAt = timeProvider.now(),
                        ),
                    )
                }
                if (!page.hasMore) break
            }
        }
        return AppResult.success(Unit)
    }

    private suspend fun applyPulled(resourceType: String, items: List<JsonObject>) {
        when (resourceType) {
            ResourceTypes.BRANCHES -> orgDao.upsertBranches(
                items.decode(BranchDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.GEOFENCES -> orgDao.upsertGeofences(
                items.decode(GeofenceDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.EMPLOYEES -> orgDao.upsertEmployees(
                items.decode(EmployeeDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.SHIFTS -> shiftDao.upsertShifts(
                items.decode(ShiftDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.SHIFT_ASSIGNMENTS -> shiftDao.upsertAssignments(
                items.decode(ShiftAssignmentDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.LEAVE_TYPES -> leaveDao.upsertTypes(
                items.decode(LeaveTypeDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.LEAVE_BALANCES -> leaveDao.upsertBalances(
                items.decode(LeaveBalanceDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.LEAVE_REQUESTS -> {
                items.decode(LeaveRequestDto.serializer()).forEach { dto ->
                    // A locally created request that hasn't pushed yet wins.
                    val local = leaveDao.requestById(dto.id)
                    if (local == null || local.syncStatus != SyncStatus.PENDING) {
                        leaveDao.upsertRequests(listOf(dto.toEntity()))
                    }
                }
            }

            // insertPunches uses IGNORE: pending local punches are never clobbered,
            // and replayed pages are no-ops.
            ResourceTypes.PUNCHES -> attendanceDao.insertPunches(
                items.decode(PunchDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.ATTENDANCE_DAYS -> attendanceDao.upsertDays(
                items.decode(AttendanceDayDto.serializer()).map { it.toEntity() },
            )

            ResourceTypes.PAYSLIPS -> items.decode(PayslipDto.serializer()).forEach { dto ->
                payslipDao.replacePayslip(dto.toEntity(), dto.toLineEntities())
            }

            ResourceTypes.ANNOUNCEMENTS -> announcementDao.upsertAnnouncements(
                items.decode(AnnouncementDto.serializer()).map { it.toEntity() },
            )
        }
    }

    private fun <T> List<JsonObject>.decode(
        serializer: kotlinx.serialization.KSerializer<T>,
    ): List<T> = mapNotNull { item ->
        try {
            json.decodeFromJsonElement(serializer, item)
        } catch (e: kotlinx.serialization.SerializationException) {
            null // One malformed document must not poison the whole page.
        }
    }

    private fun AppError.toShortMessage(): String = when (this) {
        AppError.Network -> "Offline"
        AppError.Unauthenticated -> "Session expired"
        AppError.PermissionDenied -> "Permission denied"
        is AppError.Http -> "Server error ($status)"
        is AppError.Business -> code
        else -> "Sync failed"
    }

    private companion object {
        const val PUSH_BATCH_SIZE = 50
        val PUNCH_RETENTION: Duration = Duration.ofDays(90)
    }
}
