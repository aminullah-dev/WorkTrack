package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.data.mapper.toEntity
import app.worktrack.core.data.mapper.toModel
import app.worktrack.core.database.dao.WorkDao
import app.worktrack.core.domain.repository.WorkRepository
import app.worktrack.core.model.TaskStatus
import app.worktrack.core.model.WorkTask
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import app.worktrack.core.network.dto.TaskStatusDto
import java.time.Duration
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * The employee's own work.
 *
 * Reads come from Room, so the plan survives a day on a site with no signal —
 * /work/mine needs a connection, and the answer to "what am I on" must not
 * depend on having one. Which two days to show is the use case's decision, not
 * this one's; here it is only storage.
 */
@Singleton
class WorkRepositoryImpl @Inject constructor(
    private val workDao: WorkDao,
    private val api: WorkTrackApi,
    private val timeProvider: TimeProvider,
) : WorkRepository {

    override fun observeTasks(from: LocalDate, to: LocalDate): Flow<List<WorkTask>> =
        workDao.observeBetween(from, to).map { rows -> rows.map { it.toModel() } }

    override suspend fun setStatus(taskId: String, status: TaskStatus): AppResult<Unit> =
        apiCall { api.setTaskStatus(taskId, TaskStatusDto(status.name)) }
            .map { envelope ->
                // Write the server's answer back rather than what was asked for:
                // if it refused the move, the row must not claim otherwise.
                workDao.updateStatus(taskId, envelope.data.status, envelope.data.updatedAt)
            }

    override suspend fun refresh(): AppResult<Unit> =
        apiCall { api.myWork() }.map { envelope ->
            val days = listOfNotNull(envelope.data.today, envelope.data.next)
            workDao.upsertTasks(days.flatMap { it.tasks }.map { it.toEntity() })
            workDao.pruneTasksBefore(timeProvider.today().minus(TASK_RETENTION))
        }

    private companion object {
        val TASK_RETENTION: Duration = Duration.ofDays(60)
    }
}
