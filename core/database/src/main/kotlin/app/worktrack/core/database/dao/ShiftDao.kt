package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.ShiftAssignmentEntity
import app.worktrack.core.database.entity.ShiftEntity
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

@Dao
interface ShiftDao {

    @Upsert
    suspend fun upsertShifts(shifts: List<ShiftEntity>)

    @Upsert
    suspend fun upsertAssignments(assignments: List<ShiftAssignmentEntity>)

    @Query("SELECT * FROM shifts WHERE id = :shiftId")
    suspend fun shiftById(shiftId: String): ShiftEntity?

    @Query(
        """
        SELECT s.* FROM shifts s
        INNER JOIN shift_assignments a ON a.shiftId = s.id
        WHERE a.employeeId = :employeeId AND a.date = :date
        LIMIT 1
        """,
    )
    fun observeShiftForDate(employeeId: String, date: LocalDate): Flow<ShiftEntity?>

    @Query("DELETE FROM shifts")
    suspend fun clearShifts()

    @Query("DELETE FROM shift_assignments")
    suspend fun clearAssignments()
}
