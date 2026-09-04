package app.worktrack.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.dashboard.DashboardSnapshot
import app.worktrack.core.domain.usecase.dashboard.ObserveDashboardUseCase
import app.worktrack.core.domain.usecase.sync.TriggerSyncUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

sealed interface DashboardUiState {
    data object Loading : DashboardUiState
    data class Ready(val snapshot: DashboardSnapshot) : DashboardUiState
}

@HiltViewModel
class DashboardViewModel @Inject constructor(
    observeDashboard: ObserveDashboardUseCase,
    private val triggerSync: TriggerSyncUseCase,
) : ViewModel() {

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
