package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.AttendanceDay
import java.time.YearMonth
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObserveAttendanceHistoryUseCase @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
) {

    /** Attendance days for one calendar month, newest first (per DAO ordering). */
    operator fun invoke(month: YearMonth): Flow<List<AttendanceDay>> =
        attendanceRepository.observeDays(month.atDay(1), month.atEndOfMonth())
}
