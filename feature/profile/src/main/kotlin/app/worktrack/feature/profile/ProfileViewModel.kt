package app.worktrack.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.auth.ObserveBiometricLockUseCase
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.core.domain.usecase.auth.SetBiometricLockUseCase
import app.worktrack.core.domain.usecase.auth.SignOutUseCase
import app.worktrack.core.domain.usecase.sync.ObserveSyncStateUseCase
import app.worktrack.core.domain.usecase.sync.TriggerSyncUseCase
import app.worktrack.core.model.SyncState
import app.worktrack.core.model.UserSession
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ProfileUiState(
    val session: UserSession? = null,
    val syncState: SyncState? = null,
    val isSigningOut: Boolean = false,
    val biometricEnabled: Boolean = false,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    observeSession: ObserveSessionUseCase,
    observeSyncState: ObserveSyncStateUseCase,
    observeBiometricLock: ObserveBiometricLockUseCase,
    private val setBiometricLock: SetBiometricLockUseCase,
    private val signOut: SignOutUseCase,
    private val triggerSync: TriggerSyncUseCase,
) : ViewModel() {

    private val signingOut = kotlinx.coroutines.flow.MutableStateFlow(false)

    val uiState: StateFlow<ProfileUiState> = combine(
        observeSession(),
        observeSyncState(),
        signingOut,
        observeBiometricLock(),
    ) { session, syncState, isSigningOut, biometricEnabled ->
        ProfileUiState(
            session = session,
            syncState = syncState,
            isSigningOut = isSigningOut,
            biometricEnabled = biometricEnabled,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProfileUiState(),
    )

    fun onBiometricToggle(enabled: Boolean) {
        viewModelScope.launch { setBiometricLock(enabled) }
    }

    fun onSyncNow() = triggerSync()

    fun onSignOut() {
        if (signingOut.value) return
        signingOut.value = true
        viewModelScope.launch {
            signOut.invoke()
            // No state reset needed: clearing the session flips the root nav graph.
        }
    }
}
