package app.worktrack.feature.leave.approvals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.usecase.leave.DecideLeaveRequestUseCase
import app.worktrack.core.domain.usecase.leave.ObservePendingApprovalsUseCase
import app.worktrack.core.model.ApprovalDecision
import app.worktrack.core.model.LeaveRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ApprovalsEffect {
    data class Decided(val decision: ApprovalDecision) : ApprovalsEffect
    data class Failed(val error: AppError) : ApprovalsEffect
}

@HiltViewModel
class ApprovalsViewModel @Inject constructor(
    observePendingApprovals: ObservePendingApprovalsUseCase,
    private val decideRequest: DecideLeaveRequestUseCase,
) : ViewModel() {

    val pending: StateFlow<List<LeaveRequest>> = observePendingApprovals()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** Request ids with an in-flight decision, to disable their buttons. */
    private val _deciding = MutableStateFlow<Set<String>>(emptySet())
    val deciding: StateFlow<Set<String>> = _deciding.asStateFlow()

    private val _effects = Channel<ApprovalsEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    fun onDecide(requestId: String, decision: ApprovalDecision, note: String?) {
        if (requestId in _deciding.value) return
        _deciding.update { it + requestId }
        viewModelScope.launch {
            when (val result = decideRequest(requestId, decision, note)) {
                is AppResult.Success -> _effects.send(ApprovalsEffect.Decided(decision))
                is AppResult.Failure -> _effects.send(ApprovalsEffect.Failed(result.error))
            }
            _deciding.update { it - requestId }
        }
    }
}
