package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import app.worktrack.core.database.entity.OutboxEntryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OutboxDao {

    @Insert
    suspend fun insert(entry: OutboxEntryEntity)

    /** Oldest-first pending work; FIFO ordering preserves causal order per resource. */
    @Query("SELECT * FROM outbox_entries WHERE state = 'PENDING' ORDER BY queuedAt ASC LIMIT :limit")
    suspend fun nextPending(limit: Int): List<OutboxEntryEntity>

    @Query("UPDATE outbox_entries SET state = 'IN_FLIGHT' WHERE id IN (:ids)")
    suspend fun markInFlight(ids: List<String>)

    @Query("DELETE FROM outbox_entries WHERE id = :id")
    suspend fun delete(id: String)

    @Query(
        """
        UPDATE outbox_entries
        SET state = :state, attempts = attempts + 1, lastError = :error
        WHERE id = :id
        """,
    )
    suspend fun markAttemptFailed(id: String, state: String, error: String?)

    /** Recovers entries stranded IN_FLIGHT by a process death mid-sync. */
    @Query("UPDATE outbox_entries SET state = 'PENDING' WHERE state = 'IN_FLIGHT'")
    suspend fun requeueInFlight()

    @Query("SELECT COUNT(*) FROM outbox_entries WHERE state IN ('PENDING', 'IN_FLIGHT')")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox_entries WHERE state = 'FAILED'")
    fun observeFailedCount(): Flow<Int>

    @Query("DELETE FROM outbox_entries")
    suspend fun clear()
}
