package app.worktrack.core.model

import java.time.Instant
import java.time.LocalDate

/**
 * What the employee is meant to be doing, and on which part of the job.
 *
 * Attendance answers "was I here". This answers the question a worker actually
 * asks on the way in: which part of the company's work am I on today.
 */

enum class TaskStatus { PLANNED, IN_PROGRESS, DONE, BLOCKED }

enum class TaskPriority { LOW, NORMAL, HIGH }

/** A contract, a site, a phase — the thing a task belongs to. */
data class Project(
    val id: String,
    val name: String,
    val code: String,
    val status: String,
    val updatedAt: Instant,
)

/**
 * One piece of work over a date range.
 *
 * [assigneeNames] is carried rather than looked up: the phone only ever
 * replicates its own employee row, so without the names a team task would show
 * a list of ids the worker cannot read.
 */
data class WorkTask(
    val id: String,
    val projectId: String,
    val projectName: String,
    val title: String,
    val detail: String?,
    val location: String?,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val status: TaskStatus,
    val priority: TaskPriority,
    val teamName: String?,
    val assigneeNames: List<String>,
    val updatedAt: Instant,
) {
    /** True when more than one person is on it — a crew job, not a solo one. */
    val isTeamWork: Boolean get() = assigneeNames.size > 1

    fun runsOn(date: LocalDate): Boolean = !date.isBefore(startDate) && !date.isAfter(endDate)
}

/** Why a day is empty, when it is. */
enum class DayKind { WORKING, WEEKEND, HOLIDAY }

data class WorkDay(
    val date: LocalDate,
    val kind: DayKind,
    val tasks: List<WorkTask>,
)

/**
 * Today and the next day the employee is actually expected in.
 *
 * [next] is deliberately not "tomorrow": asked on a Thursday it is Saturday,
 * because Friday is the weekend here and an empty Friday would read as having
 * nothing on.
 */
data class MyWork(
    val today: WorkDay,
    val next: WorkDay?,
)
