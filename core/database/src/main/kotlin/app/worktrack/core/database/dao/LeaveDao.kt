package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.LeaveBalanceEntity
import app.worktrack.core.database.entity.LeaveRequestEntity
import app.worktrack.core.database.entity.LeaveTypeEntity
import app.worktrack.core.model.LeaveStatus
import app.worktrack.core.model.SyncStatus
import java.time.Instant
import kotlinx.coroutines.flow.Flow

@Dao
interface LeaveDao {

    @Upsert
    suspend fun upsertTypes(types: List<LeaveTypeEntity>)

    @Query("SELECT * FROM leave_types WHERE active = 1 ORDER BY name")
    fun observeActiveTypes(): Flow<List<LeaveTypeEntity>>

    @Upsert
    suspend fun upsertBalances(balances: List<LeaveBalanceEntity>)

    @Query("SELECT * FROM leave_balances WHERE employeeId = :employeeId AND periodYear = :year")
    fun observeBalances(employeeId: String, year: Int): Flow<List<LeaveBalanceEntity>>

    @Upsert
    suspend fun upsertRequests(requests: List<LeaveRequestEntity>)

    @Query(
        """
        SELECT * FROM leave_requests
        WHERE employeeId = :employeeId
        ORDER BY startDate DESC
        LIMIT 200
        """,
    )
    fun observeMyRequests(employeeId: String): Flow<List<LeaveRequestEntity>>

    @Query(
        """
        SELECT * FROM leave_requests
        WHERE currentApproverId = :approverId AND status = 'PENDING'
        ORDER BY startDate ASC
        """,
    )
    fun observePendingApprovals(approverId: String): Flow<List<LeaveRequestEntity>>

    @Query("SELECT * FROM leave_requests WHERE id = :id")
    suspend fun requestById(id: String): LeaveRequestEntity?

    @Query(
        """
        UPDATE leave_requests
        SET status = :status, syncStatus = :syncStatus, updatedAt = :updatedAt
        WHERE id = :id
        """,
    )
    suspend fun updateRequestStatus(
        id: String,
        status: LeaveStatus,
        syncStatus: SyncStatus,
        updatedAt: Instant,
    )

    @Query("DELETE FROM leave_types")
    suspend fun clearTypes()

    @Query("DELETE FROM leave_balances")
    suspend fun clearBalances()

    @Query("DELETE FROM leave_requests")
    suspend fun clearRequests()
}
