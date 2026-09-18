package app.worktrack.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.dashboard.DashboardSnapshot
import app.worktrack.core.domain.usecase.dashboard.ObserveDashboardUseCase
import app.worktrack.core.domain.usecase.sync.TriggerSyncUseCase
import app.worktrack.core.domain.usecase.work.SetTaskStatusUseCase
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.TaskStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface DashboardUiState {
    data object Loading : DashboardUiState
    data class Ready(val snapshot: DashboardSnapshot) : DashboardUiState
}

@HiltViewModel
class DashboardViewModel @Inject constructor(
    observeDashboard: ObserveDashboardUseCase,
    private val triggerSync: TriggerSyncUseCase,
    private val setTaskStatus: SetTaskStatusUseCase,
) : ViewModel() {

    /**
     * Set when reporting progress could not reach the server.
     *
     * Reporting is online-only: the outbox carries creations, and quietly
     * queuing a status change would show the worker a green tick for something
     * the foreman never saw. Better to say the message did not get through.
     */
    private val _statusError = MutableStateFlow(false)
    val statusError: StateFlow<Boolean> = _statusError.asStateFlow()

    fun onTaskStatus(taskId: String, status: TaskStatus) {
        viewModelScope.launch {
            _statusError.value = setTaskStatus(taskId, status) is AppResult.Failure
        }
    }

    fun onStatusErrorShown() {
        _statusError.value = false
    }

    val uiState: StateFlow<DashboardUiState> = observeDashboard()
        .map { snapshot ->
            if (snapshot == null) DashboardUiState.Loading else DashboardUiState.Ready(snapshot)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = DashboardUiState.Loading,
        )

    /** Pull-to-refresh: sync runs in the background; Room flows update the UI. */
    fun onRefresh() = triggerSync()
}
