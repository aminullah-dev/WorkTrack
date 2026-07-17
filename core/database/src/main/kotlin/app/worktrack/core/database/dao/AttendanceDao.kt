package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.AttendanceDayEntity
import app.worktrack.core.database.entity.AttendancePunchEntity
import app.worktrack.core.model.SyncStatus
import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

@Dao
interface AttendanceDao {

    // Punches are append-only: IGNORE keeps the first write (idempotent replays).
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPunch(punch: AttendancePunchEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertPunches(punches: List<AttendancePunchEntity>)

    @Query(
        """
        SELECT * FROM attendance_punches
        WHERE employeeId = :employeeId AND punchedAt BETWEEN :from AND :to
        ORDER BY punchedAt ASC
        """,
    )
    fun observePunchesBetween(
        employeeId: String,
        from: Instant,
        to: Instant,
    ): Flow<List<AttendancePunchEntity>>

    @Query(
        """
        UPDATE attendance_punches
        SET syncStatus = :syncStatus, serverValidated = :serverValidated,
            invalidReason = :invalidReason
        WHERE id = :id
        """,
    )
    suspend fun updatePunchSyncResult(
        id: String,
        syncStatus: SyncStatus,
        serverValidated: Boolean,
        invalidReason: String?,
    )

    @Query("DELETE FROM attendance_punches WHERE punchedAt < :cutoff AND syncStatus = 'SYNCED'")
    suspend fun prunePunchesBefore(cutoff: Instant)

    @Upsert
    suspend fun upsertDays(days: List<AttendanceDayEntity>)

    @Query(
        """
        SELECT * FROM attendance_days
        WHERE employeeId = :employeeId AND date BETWEEN :from AND :to
        ORDER BY date DESC
        """,
    )
    fun observeDaysBetween(
        employeeId: String,
        from: LocalDate,
        to: LocalDate,
    ): Flow<List<AttendanceDayEntity>>

    @Query("DELETE FROM attendance_punches")
    suspend fun clearPunches()

    @Query("DELETE FROM attendance_days")
    suspend fun clearDays()
}
