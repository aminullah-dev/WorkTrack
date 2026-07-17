package app.worktrack.core.domain.usecase.dashboard

import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.AnnouncementRepository
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.domain.repository.AuthRepository
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.model.Announcement
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.TodayAttendance
import app.worktrack.core.model.UserSession
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

data class DashboardSnapshot(
    val session: UserSession,
    val today: TodayAttendance,
    val leaveBalances: List<LeaveBalance>,
    val announcements: List<Announcement>,
)

class ObserveDashboardUseCase @Inject constructor(
    private val authRepository: AuthRepository,
    private val attendanceRepository: AttendanceRepository,
    private val leaveRepository: LeaveRepository,
    private val announcementRepository: AnnouncementRepository,
    private val timeProvider: TimeProvider,
) {

    /** Emits null while signed out; the app shell redirects to auth in that case. */
    operator fun invoke(): Flow<DashboardSnapshot?> = combine(
        authRepository.session,
        attendanceRepository.observeToday(),
        leaveRepository.observeMyBalances(timeProvider.today().year),
        announcementRepository.observeAnnouncements(),
    ) { session, today, balances, announcements ->
        session?.let {
            DashboardSnapshot(
                session = it,
                today = today,
                leaveBalances = balances,
                announcements = announcements.take(MAX_DASHBOARD_ANNOUNCEMENTS),
            )
        }
    }

    private companion object {
        const val MAX_DASHBOARD_ANNOUNCEMENTS = 5
    }
}
