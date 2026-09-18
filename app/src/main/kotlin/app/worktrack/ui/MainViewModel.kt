package app.worktrack.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.auth.ObserveBiometricLockUseCase
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.core.model.UserSession
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
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
    observeBiometricLock: ObserveBiometricLockUseCase,
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

    // In-memory: reset to false on every cold start, so a fresh app launch with
    // a persisted session must pass the biometric prompt again.
    private val unlocked = MutableStateFlow(false)

    /** True when a signed-in user must clear the biometric lock before continuing. */
    val locked: StateFlow<Boolean> = combine(observeBiometricLock(), unlocked) { enabled, unlocked ->
        enabled && !unlocked
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = false,
    )

    fun onUnlocked() {
        unlocked.value = true
    }
}
