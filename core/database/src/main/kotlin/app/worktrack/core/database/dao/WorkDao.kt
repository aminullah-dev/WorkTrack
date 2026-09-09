package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.ProjectEntity
import app.worktrack.core.database.entity.TaskEntity
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkDao {

    @Upsert
    suspend fun upsertProjects(projects: List<ProjectEntity>)

    @Upsert
    suspend fun upsertTasks(tasks: List<TaskEntity>)

    /**
     * Every task live on any day in [from]..[to].
     *
     * A task overlaps the window when it has not finished before it starts and
     * did not start after it ends — not when its own start falls inside it,
     * which would hide the multi-day job an employee is in the middle of.
     */
    @Query(
        """
        SELECT * FROM tasks
        WHERE endDate >= :from AND startDate <= :to
        ORDER BY startDate ASC, title ASC
        """,
    )
    fun observeBetween(from: LocalDate, to: LocalDate): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE id = :id")
    suspend fun taskById(id: String): TaskEntity?

    @Query("UPDATE tasks SET status = :status, updatedAt = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, updatedAt: java.time.Instant)

    /**
     * Work that finished before [before] is dropped. Without this the table
     * grows for the life of the install, on phones that have little room.
     */
    @Query("DELETE FROM tasks WHERE endDate < :before")
    suspend fun pruneTasksBefore(before: LocalDate)

    @Query("DELETE FROM tasks")
    suspend fun clearTasks()

    @Query("DELETE FROM projects")
    suspend fun clearProjects()
}
