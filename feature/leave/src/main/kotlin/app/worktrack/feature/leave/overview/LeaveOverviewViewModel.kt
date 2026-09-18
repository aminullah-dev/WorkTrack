package app.worktrack.feature.leave.overview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.core.domain.usecase.leave.CancelLeaveRequestUseCase
import app.worktrack.core.domain.usecase.leave.LeaveOverview
import app.worktrack.core.domain.usecase.leave.ObserveLeaveOverviewUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class LeaveOverviewUiState(
    val overview: LeaveOverview = LeaveOverview(emptyList(), emptyList(), emptyList()),
    val isApprover: Boolean = false,
)

sealed interface LeaveOverviewEffect {
    data object Cancelled : LeaveOverviewEffect
    data class Failed(val error: AppError) : LeaveOverviewEffect
}

@HiltViewModel
class LeaveOverviewViewModel @Inject constructor(
    observeOverview: ObserveLeaveOverviewUseCase,
    observeSession: ObserveSessionUseCase,
    private val cancelRequest: CancelLeaveRequestUseCase,
) : ViewModel() {

    private val _effects = Channel<LeaveOverviewEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    val uiState: StateFlow<LeaveOverviewUiState> = combine(
        observeOverview(),
        observeSession(),
    ) { overview, session ->
        LeaveOverviewUiState(
            overview = overview,
            isApprover = session?.isApprover == true,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = LeaveOverviewUiState(),
    )

    fun onCancelRequest(requestId: String) {
        viewModelScope.launch {
            when (val result = cancelRequest(requestId)) {
                is AppResult.Success -> _effects.send(LeaveOverviewEffect.Cancelled)
                is AppResult.Failure -> _effects.send(LeaveOverviewEffect.Failed(result.error))
            }
        }
    }
}
