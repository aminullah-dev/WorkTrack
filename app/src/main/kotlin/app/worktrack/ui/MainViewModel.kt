package app.worktrack.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.core.model.UserSession
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Root auth state: Loading until the persisted session has been read once. */
sealed interface RootUiState {
    data object Loading : RootUiState
    data object SignedOut : RootUiState
    data class SignedIn(val session: UserSession) : RootUiState
}

@HiltViewModel
class MainViewModel @Inject constructor(
    observeSession: ObserveSessionUseCase,
) : ViewModel() {

    val uiState: StateFlow<RootUiState> = observeSession()
        .map { session ->
            if (session == null) RootUiState.SignedOut else RootUiState.SignedIn(session)
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = RootUiState.Loading,
        )
}
