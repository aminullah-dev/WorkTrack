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
import app.worktrack.core.database.dao.LeaveDao
import app.worktrack.core.database.entity.LeaveRequestEntity
import app.worktrack.core.datastore.SessionStore
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.domain.usecase.leave.ApplyLeaveUseCase
import app.worktrack.core.model.ApprovalDecision
import app.worktrack.core.model.LeaveApplication
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.LeaveRequest
import app.worktrack.core.model.LeaveStatus
import app.worktrack.core.model.LeaveType
import app.worktrack.core.model.SyncStatus
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import app.worktrack.core.network.dto.LeaveDecisionDto
import app.worktrack.core.network.dto.LeaveRequestCreateDto
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

@Singleton
class LeaveRepositoryImpl @Inject constructor(
    private val leaveDao: LeaveDao,
    private val sessionStore: SessionStore,
    private val outboxWriter: OutboxWriter,
    private val api: WorkTrackApi,
    private val timeProvider: TimeProvider,
    private val json: Json,
) : LeaveRepository {

    override fun observeTypes(): Flow<List<LeaveType>> =
        leaveDao.observeActiveTypes().map { types -> types.map { it.toModel() } }

    override fun observeMyBalances(periodYear: Int): Flow<List<LeaveBalance>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null) {
                flowOf(emptyList())
            } else {
                leaveDao.observeBalances(session.employeeId, periodYear)
                    .map { balances -> balances.map { it.toModel() } }
            }
        }

    override fun observeMyRequests(): Flow<List<LeaveRequest>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null) {
                flowOf(emptyList())
            } else {
                leaveDao.observeMyRequests(session.employeeId)
                    .map { requests -> requests.map { it.toModel() } }
            }
        }

    override fun observePendingApprovals(): Flow<List<LeaveRequest>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null || !session.isApprover) {
                flowOf(emptyList())
            } else {
                leaveDao.observePendingApprovals(session.employeeId)
                    .map { requests -> requests.map { it.toModel() } }
            }
        }

    override suspend fun apply(application: LeaveApplication): AppResult<LeaveRequest> {
        val session = sessionStore.session.first()
            ?: return AppResult.failure(AppError.Unauthenticated)

        val now = timeProvider.now()
        val entity = LeaveRequestEntity(
            id = Ulid.generate(now.toEpochMilli()),
            companyId = session.companyId,
            employeeId = session.employeeId,
            employeeName = session.displayName,
            leaveTypeId = application.leaveTypeId,
            startDate = application.startDate,
            endDate = application.endDate,
            startHalfDay = application.startHalfDay,
            endHalfDay = application.endHalfDay,
            days = ApplyLeaveUseCase.calculateDays(application),
            reason = application.reason.trim(),
            status = LeaveStatus.PENDING,
            currentApproverId = null, // resolved server-side from the approval chain
            decidedAt = null,
            decisionNote = null,
            createdAt = now,
            updatedAt = now,
            syncStatus = SyncStatus.PENDING,
        )
        leaveDao.upsertRequests(listOf(entity))

        val payload = LeaveRequestCreateDto(
            id = entity.id,
            leaveTypeId = entity.leaveTypeId,
            startDate = entity.startDate,
            endDate = entity.endDate,
            startHalfDay = entity.startHalfDay,
            endHalfDay = entity.endHalfDay,
            reason = entity.reason,
        )
        outboxWriter.enqueue(
            opType = OutboxOpTypes.CREATE,
            resourceType = ResourceTypes.LEAVE_REQUESTS,
            resourceId = entity.id,
            payloadJson = json.encodeToString(LeaveRequestCreateDto.serializer(), payload),
        )
        return AppResult.success(entity.toModel())
    }

    override suspend fun cancel(requestId: String): AppResult<Unit> {
        val existing = leaveDao.requestById(requestId)
            ?: return AppResult.failure(AppError.NotFound)
        if (existing.syncStatus != SyncStatus.SYNCED) {
            return AppResult.failure(
                AppError.Business(
                    code = "NOT_SYNCED",
                    message = "Wait for this request to finish syncing before cancelling",
                ),
            )
        }
        return apiCall { api.cancelLeaveRequest(requestId, idempotencyKey = Ulid.generate()) }
            .map { envelope ->
                leaveDao.upsertRequests(listOf(envelope.data.toEntity()))
            }
    }

    override suspend fun decide(
        requestId: String,
        decision: ApprovalDecision,
        note: String?,
    ): AppResult<Unit> =
        apiCall {
            api.decideLeaveRequest(
                requestId = requestId,
                body = LeaveDecisionDto(decision = decision.name, note = note),
                idempotencyKey = Ulid.generate(),
            )
        }.map { envelope ->
            leaveDao.upsertRequests(listOf(envelope.data.toEntity()))
        }

    override suspend fun refresh(): AppResult<Unit> {
        val mine = apiCall { api.leaveRequests(scope = "mine") }
        val approvals = apiCall { api.leaveRequests(scope = "approvals") }

        listOf(mine, approvals).forEach { result ->
            if (result is AppResult.Success) {
                result.data.data.forEach { dto ->
                    // Never clobber a locally created request that hasn't pushed yet.
                    val local = leaveDao.requestById(dto.id)
                    if (local == null || local.syncStatus != SyncStatus.PENDING) {
                        leaveDao.upsertRequests(listOf(dto.toEntity()))
                    }
                }
            }
        }
        return when {
            mine is AppResult.Failure -> mine
            approvals is AppResult.Failure -> approvals
            else -> AppResult.success(Unit)
        }
    }
}
