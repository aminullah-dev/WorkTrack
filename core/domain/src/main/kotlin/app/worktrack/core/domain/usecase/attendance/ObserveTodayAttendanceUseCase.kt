package app.worktrack.core.domain.usecase.attendance

import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.TodayAttendance
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObserveTodayAttendanceUseCase @Inject constructor(
    private val attendanceRepository: AttendanceRepository,
) {
    operator fun invoke(): Flow<TodayAttendance> = attendanceRepository.observeToday()
}
