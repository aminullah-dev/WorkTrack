package app.worktrack.feature.attendance.punch

import android.Manifest
import androidx.annotation.RequiresPermission
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.usecase.attendance.EvaluateGeofenceUseCase
import app.worktrack.core.domain.usecase.attendance.GeofenceEvaluation
import app.worktrack.core.domain.usecase.attendance.ObserveTodayAttendanceUseCase
import app.worktrack.core.domain.usecase.attendance.PunchClockUseCase
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.core.model.PunchCommand
import app.worktrack.core.model.PunchMethod
import app.worktrack.core.model.PunchType
import app.worktrack.core.model.TodayAttendance
import app.worktrack.feature.attendance.location.DeviceLocation
import app.worktrack.feature.attendance.location.LocationClient
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class LocationUnavailableReason { PERMISSION_DENIED, NO_FIX }

sealed interface LocationUiState {
    data object PermissionRequired : LocationUiState
    data object Acquiring : LocationUiState
    data class Ready(
        val location: DeviceLocation,
        val evaluation: GeofenceEvaluation,
    ) : LocationUiState

    data class Unavailable(val reason: LocationUnavailableReason) : LocationUiState
}

data class PunchUiState(
    val location: LocationUiState = LocationUiState.PermissionRequired,
    val isPunching: Boolean = false,
)

sealed interface PunchEffect {
    /** Localized by the UI via AppError.localizedMessage(). */
    data class Failed(val error: AppError) : PunchEffect
    data class PunchRecorded(val type: PunchType) : PunchEffect
}

@HiltViewModel
class PunchViewModel @Inject constructor(
    observeToday: ObserveTodayAttendanceUseCase,
    observeSession: ObserveSessionUseCase,
    private val punchClock: PunchClockUseCase,
    private val evaluateGeofence: EvaluateGeofenceUseCase,
    private val locationClient: LocationClient,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val today: StateFlow<TodayAttendance?> = observeToday()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Whether the company requires a check-in selfie (feature flag). */
    val faceRequired: StateFlow<Boolean> = observeSession()
        .map { it?.features?.faceRecognition == true }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _uiState = MutableStateFlow(PunchUiState())
    val uiState: StateFlow<PunchUiState> = _uiState.asStateFlow()

    private val _effects = Channel<PunchEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    init {
        // A kiosk token arrives via SavedStateHandle when the QR scanner pops back.
        viewModelScope.launch {
            savedStateHandle.getStateFlow<String?>(KEY_KIOSK_TOKEN, null).collect { token ->
                if (!token.isNullOrBlank()) {
                    savedStateHandle[KEY_KIOSK_TOKEN] = null
                    punchWithQr(token)
                }
            }
        }
        // A selfie arrives the same way when the capture screen pops back.
        viewModelScope.launch {
            savedStateHandle.getStateFlow<String?>(KEY_SELFIE, null).collect { selfie ->
                if (!selfie.isNullOrBlank()) {
                    savedStateHandle[KEY_SELFIE] = null
                    punchWithSelfie(selfie)
                }
            }
        }
    }

    /** Invoked by the screen once ACCESS_FINE_LOCATION is granted. */
    @RequiresPermission(Manifest.permission.ACCESS_FINE_LOCATION)
    fun onLocationPermissionGranted() {
        if (_uiState.value.location is LocationUiState.Acquiring) return
        _uiState.update { it.copy(location = LocationUiState.Acquiring) }

        viewModelScope.launch {
            val location = try {
                locationClient.currentLocation()
            } catch (_: SecurityException) {
                null
            }
            if (location == null) {
                _uiState.update {
                    it.copy(
                        location = LocationUiState.Unavailable(LocationUnavailableReason.NO_FIX),
                    )
                }
            } else {
                val evaluation =
                    evaluateGeofence(location.latitude, location.longitude, location.accuracyMeters)
                _uiState.update { it.copy(location = LocationUiState.Ready(location, evaluation)) }
            }
        }
    }

    fun onLocationPermissionDenied() {
        _uiState.update {
            it.copy(
                location = LocationUiState.Unavailable(LocationUnavailableReason.PERMISSION_DENIED),
            )
        }
    }

    fun onPunch() {
        val ready = _uiState.value.location as? LocationUiState.Ready ?: return
        val nextType = nextPunchType() ?: return
        submit(
            PunchCommand(
                type = nextType,
                method = PunchMethod.GPS,
                latitude = ready.location.latitude,
                longitude = ready.location.longitude,
                accuracyMeters = ready.location.accuracyMeters,
                isMockLocation = ready.location.isMock,
            ),
        )
    }

    /** GPS punch carrying the captured check-in selfie (photo-verified path). */
    private fun punchWithSelfie(selfie: String) {
        val ready = _uiState.value.location as? LocationUiState.Ready ?: return
        val nextType = nextPunchType() ?: return
        submit(
            PunchCommand(
                type = nextType,
                method = PunchMethod.GPS,
                latitude = ready.location.latitude,
                longitude = ready.location.longitude,
                accuracyMeters = ready.location.accuracyMeters,
                isMockLocation = ready.location.isMock,
                selfie = selfie,
                faceVerified = true,
            ),
        )
    }

    private fun punchWithQr(kioskToken: String) {
        val nextType = nextPunchType() ?: return
        val ready = _uiState.value.location as? LocationUiState.Ready
        submit(
            PunchCommand(
                type = nextType,
                method = PunchMethod.QR,
                latitude = ready?.location?.latitude,
                longitude = ready?.location?.longitude,
                accuracyMeters = ready?.location?.accuracyMeters,
                isMockLocation = ready?.location?.isMock ?: false,
                kioskToken = kioskToken,
            ),
        )
    }

    private fun submit(command: PunchCommand) {
        if (_uiState.value.isPunching) return
        _uiState.update { it.copy(isPunching = true) }
        viewModelScope.launch {
            when (val result = punchClock(command)) {
                is AppResult.Success ->
                    _effects.send(PunchEffect.PunchRecorded(command.type))

                is AppResult.Failure ->
                    _effects.send(PunchEffect.Failed(result.error))
            }
            _uiState.update { it.copy(isPunching = false) }
        }
    }

    private fun nextPunchType(): PunchType? =
        today.value?.let { if (it.clockedIn) PunchType.OUT else PunchType.IN }

    companion object {
        const val KEY_KIOSK_TOKEN = "kioskToken"
        const val KEY_SELFIE = "selfie"
    }
}
