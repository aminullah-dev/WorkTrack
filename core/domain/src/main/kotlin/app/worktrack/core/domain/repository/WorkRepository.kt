package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.TaskStatus
import app.worktrack.core.model.WorkTask
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow

interface WorkRepository {

    /**
     * Every task live on any day in [from]..[to], from the local database.
     *
     * Reads work offline: a site with no signal is the normal case, and the
     * plan for the day was pulled the last time there was any.
     */
    fun observeTasks(from: LocalDate, to: LocalDate): Flow<List<WorkTask>>

    /** Report progress on one of your own tasks. Requires a connection. */
    suspend fun setStatus(taskId: String, status: TaskStatus): AppResult<Unit>

    suspend fun refresh(): AppResult<Unit>
}
