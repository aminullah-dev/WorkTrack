package app.worktrack.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.time.Instant
import java.time.LocalDate

/** Reference data: what the company is building. */
@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey val id: String,
    val name: String,
    val code: String,
    val status: String,
    val updatedAt: Instant,
)

/**
 * One piece of work assigned to this employee.
 *
 * Only the caller's own tasks are ever replicated here — the delta pull is
 * scoped by assignee — so there is no employee column to filter on. The names
 * of the others on the job travel with the row for the same reason.
 *
 * Indexed on endDate because every read is "what is live on or after day X".
 */
@Entity(tableName = "tasks", indices = [Index("endDate")])
data class TaskEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val projectName: String,
    val title: String,
    val detail: String?,
    val location: String?,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val status: String,
    val priority: String,
    val teamName: String?,
    val assigneeNames: List<String>,
    val updatedAt: Instant,
)
