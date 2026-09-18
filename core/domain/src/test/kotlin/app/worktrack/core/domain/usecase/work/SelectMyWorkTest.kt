package app.worktrack.core.domain.usecase.work

import app.worktrack.core.model.TaskPriority
import app.worktrack.core.model.TaskStatus
import app.worktrack.core.model.WorkTask
import java.time.Instant
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which two days the phone shows.
 *
 * This is the one piece of the feature a worker acts on directly: he reads the
 * second card, and goes where it says. Getting it wrong on a Thursday sends
 * somebody to the wrong part of the site on Saturday.
 */
class SelectMyWorkTest {

    // 2026-09-10 is a Thursday; Friday is the weekend in Afghanistan.
    private val thursday = LocalDate.parse("2026-09-10")
    private val friday = LocalDate.parse("2026-09-11")
    private val saturday = LocalDate.parse("2026-09-12")

    private fun task(
        id: String,
        start: String,
        end: String = start,
        names: List<String> = listOf("Ali Rahimi"),
    ) = WorkTask(
        id = id,
        projectId = "p1",
        projectName = "Darulaman Tower",
        title = "Task $id",
        detail = null,
        location = null,
        startDate = LocalDate.parse(start),
        endDate = LocalDate.parse(end),
        status = TaskStatus.PLANNED,
        priority = TaskPriority.NORMAL,
        teamName = null,
        assigneeNames = names,
        updatedAt = Instant.EPOCH,
    )

    @Test
    fun `skips the empty weekend and answers with Saturday's work`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-12")))

        assertEquals(saturday, work.next!!.date)
        assertEquals(listOf("a"), work.next!!.tasks.map { it.id })
    }

    @Test
    fun `does not offer an empty Friday just because it is tomorrow`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-12")))
        assertFalse(work.next!!.date == friday)
    }

    @Test
    fun `uses tomorrow when tomorrow is the day that has work`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-11")))
        assertEquals(friday, work.next!!.date)
    }

    @Test
    fun `shows today's work on today`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-10"), task("b", "2026-09-12")))

        assertEquals(listOf("a"), work.today.tasks.map { it.id })
        assertEquals(thursday, work.today.date)
    }

    @Test
    fun `a multi-day job appears on both days`() {
        // The job an employee is in the middle of is the one most likely to be
        // dropped by a naive "starts today" filter.
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-08", "2026-09-14")))

        assertEquals(listOf("a"), work.today.tasks.map { it.id })
        assertEquals(listOf("a"), work.next!!.tasks.map { it.id })
        // And the next day is simply tomorrow, because the job runs through it.
        assertEquals(friday, work.next!!.date)
    }

    @Test
    fun `still shows a second day when nothing at all is assigned`() {
        // Dropping the card would leave the worker wondering whether the app
        // failed to load rather than whether he has anything on.
        val work = selectMyWork(thursday, emptyList())

        assertTrue(work.today.tasks.isEmpty())
        assertEquals(friday, work.next!!.date)
        assertTrue(work.next!!.tasks.isEmpty())
    }

    @Test
    fun `ignores work beyond the fortnight it looks ahead`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-10-20")))
        assertEquals(friday, work.next!!.date)
        assertTrue(work.next!!.tasks.isEmpty())
    }

    @Test
    fun `does not resurrect work that finished yesterday`() {
        val work = selectMyWork(thursday, listOf(task("a", "2026-09-01", "2026-09-09")))
        assertTrue(work.today.tasks.isEmpty())
        assertTrue(work.next!!.tasks.isEmpty())
    }

    @Test
    fun `a job with two names on it is team work`() {
        assertTrue(task("a", "2026-09-10", names = listOf("Ali", "Omar")).isTeamWork)
        assertFalse(task("a", "2026-09-10", names = listOf("Ali")).isTeamWork)
    }

    @Test
    fun `runsOn includes both ends of the span`() {
        val t = task("a", "2026-09-10", "2026-09-12")
        assertTrue(t.runsOn(thursday))
        assertTrue(t.runsOn(saturday))
        assertFalse(t.runsOn(LocalDate.parse("2026-09-09")))
        assertFalse(t.runsOn(LocalDate.parse("2026-09-13")))
    }
}
