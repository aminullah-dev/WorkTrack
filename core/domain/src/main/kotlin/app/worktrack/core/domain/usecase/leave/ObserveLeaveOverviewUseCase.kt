package app.worktrack.core.domain.usecase.leave

import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.LeaveRequest
import app.worktrack.core.model.LeaveType
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/** Everything the leave screen needs, joined so type metadata is always resolvable. */
data class LeaveOverview(
    val types: List<LeaveType>,
    val balances: List<LeaveBalance>,
    val myRequests: List<LeaveRequest>,
) {
    fun typeOf(leaveTypeId: String): LeaveType? = types.firstOrNull { it.id == leaveTypeId }
}

class ObserveLeaveOverviewUseCase @Inject constructor(
    private val leaveRepository: LeaveRepository,
    private val timeProvider: TimeProvider,
) {

    operator fun invoke(): Flow<LeaveOverview> = combine(
        leaveRepository.observeTypes(),
        leaveRepository.observeMyBalances(timeProvider.today().year),
        leaveRepository.observeMyRequests(),
    ) { types, balances, requests ->
        LeaveOverview(types = types, balances = balances, myRequests = requests)
    }
}
