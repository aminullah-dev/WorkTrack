package app.worktrack.core.domain.usecase.work

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.WorkRepository
import app.worktrack.core.model.DayKind
import app.worktrack.core.model.MyWork
import app.worktrack.core.model.TaskStatus
import app.worktrack.core.model.WorkDay
import app.worktrack.core.model.WorkTask
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * How far ahead to look for the next day carrying work. A fortnight covers a
 * weekend plus the longest run of public holidays the Afghan calendar produces.
 */
const val WORK_LOOKAHEAD_DAYS = 14L

/**
 * Today, plus the next day that actually has something on it.
 *
 * Skipping empty days is what makes this useful on a Thursday: the honest
 * answer to "and after that?" is Saturday's work, not an empty Friday. A worker
 * shown a blank Friday concludes he is not needed, and finds out otherwise when
 * somebody rings him.
 *
 * The server is the authority on which days are weekends and holidays — it
 * holds the company's calendar — so this deliberately does not try to
 * reproduce that rule. It reproduces only the shape, which is all the phone
 * needs to be right about while it is offline: the correct tasks on the
 * correct dates.
 *
 * Pure, and separate from the repository, because it is the one piece of this
 * feature that can be wrong in a way the worker acts on.
 */
fun selectMyWork(
    today: LocalDate,
    tasks: List<WorkTask>,
    lookaheadDays: Long = WORK_LOOKAHEAD_DAYS,
): MyWork {
    val nextDate = (1..lookaheadDays)
        .map { today.plusDays(it) }
        .firstOrNull { date -> tasks.any { it.runsOn(date) } }
        // Nothing scheduled at all: show a plain tomorrow rather than dropping
        // the second card, so its absence never has to be explained.
        ?: today.plusDays(1)

    return MyWork(
        today = WorkDay(today, DayKind.WORKING, tasks.filter { it.runsOn(today) }),
        next = WorkDay(nextDate, DayKind.WORKING, tasks.filter { it.runsOn(nextDate) }),
    )
}

/** What this employee is on today and on the next day carrying work. */
class ObserveMyWorkUseCase @Inject constructor(
    private val workRepository: WorkRepository,
    private val timeProvider: TimeProvider,
) {
    operator fun invoke(): Flow<MyWork> {
        val today = timeProvider.today()
        return workRepository
            .observeTasks(today, today.plusDays(WORK_LOOKAHEAD_DAYS))
            .map { tasks -> selectMyWork(today, tasks) }
    }
}

/** Report progress on your own task. */
class SetTaskStatusUseCase @Inject constructor(
    private val workRepository: WorkRepository,
) {
    suspend operator fun invoke(taskId: String, status: TaskStatus): AppResult<Unit> =
        workRepository.setStatus(taskId, status)
}
