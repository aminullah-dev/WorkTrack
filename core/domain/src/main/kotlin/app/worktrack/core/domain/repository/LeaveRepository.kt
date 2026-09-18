package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.ApprovalDecision
import app.worktrack.core.model.LeaveApplication
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.LeaveRequest
import app.worktrack.core.model.LeaveType
import kotlinx.coroutines.flow.Flow

interface LeaveRepository {

    fun observeTypes(): Flow<List<LeaveType>>

    fun observeMyBalances(periodYear: Int): Flow<List<LeaveBalance>>

    fun observeMyRequests(): Flow<List<LeaveRequest>>

    /** Requests awaiting the current user's decision. Empty for non-approvers. */
    fun observePendingApprovals(): Flow<List<LeaveRequest>>

    /**
     * Creates a request offline-first (local insert + outbox). The server is
     * authoritative on balances and may reject on sync; rejection surfaces as a
     * FAILED sync status plus a notification, never silent loss.
     */
    suspend fun apply(application: LeaveApplication): AppResult<LeaveRequest>

    suspend fun cancel(requestId: String): AppResult<Unit>

    /** Approve/reject as the current approver. Requires connectivity (server-authoritative). */
    suspend fun decide(requestId: String, decision: ApprovalDecision, note: String?): AppResult<Unit>

    suspend fun refresh(): AppResult<Unit>
}
