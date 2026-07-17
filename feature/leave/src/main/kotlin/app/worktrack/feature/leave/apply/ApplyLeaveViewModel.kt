package app.worktrack.feature.leave.apply

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.userMessage
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.domain.usecase.leave.ApplyLeaveUseCase
import app.worktrack.core.model.LeaveApplication
import app.worktrack.core.model.LeaveType
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
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

data class ApplyLeaveUiState(
    val leaveTypeId: String? = null,
    val startDate: LocalDate? = null,
    val endDate: LocalDate? = null,
    val startHalfDay: Boolean = false,
    val endHalfDay: Boolean = false,
    val reason: String = "",
    val isSubmitting: Boolean = false,
    val fieldErrors: Map<String, String> = emptyMap(),
) {
    val estimatedDays: Double
        get() {
            val start = startDate ?: return 0.0
            val end = endDate ?: return 0.0
            if (leaveTypeId == null) return 0.0
            return ApplyLeaveUseCase.calculateDays(
                LeaveApplication(leaveTypeId, start, end, startHalfDay, endHalfDay, reason),
            )
        }
}

sealed interface ApplyLeaveEffect {
    data object Submitted : ApplyLeaveEffect
    data class Message(val text: String) : ApplyLeaveEffect
}

@HiltViewModel
class ApplyLeaveViewModel @Inject constructor(
    leaveRepository: LeaveRepository,
    private val applyLeave: ApplyLeaveUseCase,
) : ViewModel() {

    val types: StateFlow<List<LeaveType>> = leaveRepository.observeTypes()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _uiState = MutableStateFlow(ApplyLeaveUiState())
    val uiState: StateFlow<ApplyLeaveUiState> = _uiState.asStateFlow()

    private val _effects = Channel<ApplyLeaveEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    fun onTypeSelect(typeId: String) = _uiState.update { it.copy(leaveTypeId = typeId) }

    fun onStartDate(date: LocalDate) = _uiState.update {
        it.copy(
            startDate = date,
            // Keep the range valid as the user picks dates out of order.
            endDate = it.endDate?.takeIf { end -> !end.isBefore(date) } ?: date,
            fieldErrors = it.fieldErrors - "startDate",
        )
    }

    fun onEndDate(date: LocalDate) = _uiState.update {
        it.copy(endDate = date, fieldErrors = it.fieldErrors - "endDate")
    }

    fun onStartHalfDayToggle() = _uiState.update { it.copy(startHalfDay = !it.startHalfDay) }

    fun onEndHalfDayToggle() = _uiState.update { it.copy(endHalfDay = !it.endHalfDay) }

    fun onReasonChange(value: String) = _uiState.update {
        it.copy(reason = value, fieldErrors = it.fieldErrors - "reason")
    }

    fun onSubmit() {
        val state = _uiState.value
        if (state.isSubmitting) return

        val typeId = state.leaveTypeId
        val start = state.startDate
        val end = state.endDate
        val missing = buildMap {
            if (typeId == null) put("leaveTypeId", "Choose a leave type")
            if (start == null) put("startDate", "Choose a start date")
            if (end == null) put("endDate", "Choose an end date")
        }
        if (missing.isNotEmpty() || typeId == null || start == null || end == null) {
            _uiState.update { it.copy(fieldErrors = missing) }
            return
        }

        _uiState.update { it.copy(isSubmitting = true, fieldErrors = emptyMap()) }
        viewModelScope.launch {
            val result = applyLeave(
                LeaveApplication(
                    leaveTypeId = typeId,
                    startDate = start,
                    endDate = end,
                    startHalfDay = state.startHalfDay,
                    endHalfDay = state.endHalfDay,
                    reason = state.reason,
                ),
            )
            when (result) {
                is AppResult.Success -> _effects.send(ApplyLeaveEffect.Submitted)
                is AppResult.Failure -> {
                    _uiState.update {
                        it.copy(
                            fieldErrors = (result.error as? AppError.Validation)?.fieldErrors.orEmpty(),
                        )
                    }
                    _effects.send(ApplyLeaveEffect.Message(result.error.userMessage()))
                }
            }
            _uiState.update { it.copy(isSubmitting = false) }
        }
    }
}
