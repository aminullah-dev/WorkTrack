package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.model.LeaveApplication
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class ApplyLeaveUseCaseTest {

    private fun application(
        start: LocalDate,
        end: LocalDate,
        startHalf: Boolean = false,
        endHalf: Boolean = false,
    ) = LeaveApplication(
        leaveTypeId = "lt-1",
        startDate = start,
        endDate = end,
        startHalfDay = startHalf,
        endHalfDay = endHalf,
        reason = "Family event",
    )

    @Test
    fun `full single day counts as one`() {
        val app = application(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 7, 20))
        assertEquals(1.0, ApplyLeaveUseCase.calculateDays(app), 0.0)
    }

    @Test
    fun `half single day counts as half regardless of which flag`() {
        val start = LocalDate.of(2026, 7, 20)
        assertEquals(0.5, ApplyLeaveUseCase.calculateDays(application(start, start, startHalf = true)), 0.0)
        assertEquals(0.5, ApplyLeaveUseCase.calculateDays(application(start, start, endHalf = true)), 0.0)
        assertEquals(0.5, ApplyLeaveUseCase.calculateDays(application(start, start, startHalf = true, endHalf = true)), 0.0)
    }

    @Test
    fun `inclusive multi day range`() {
        val app = application(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 7, 24))
        assertEquals(5.0, ApplyLeaveUseCase.calculateDays(app), 0.0)
    }

    @Test
    fun `half days trim both ends of a range`() {
        val app = application(
            LocalDate.of(2026, 7, 20),
            LocalDate.of(2026, 7, 24),
            startHalf = true,
            endHalf = true,
        )
        assertEquals(4.0, ApplyLeaveUseCase.calculateDays(app), 0.0)
    }

    @Test
    fun `inverted range yields zero`() {
        val app = application(LocalDate.of(2026, 7, 24), LocalDate.of(2026, 7, 20))
        assertEquals(0.0, ApplyLeaveUseCase.calculateDays(app), 0.0)
    }
}
