package app.worktrack.feature.attendance.punch

import android.Manifest
import androidx.annotation.RequiresPermission
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
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withTimeoutOrNull
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

    /** Verification succeeded but the location fix was gone by the time we punched. */
    data object LocationLost : PunchEffect
}

@HiltViewModel
class PunchViewModel @Inject constructor(
    observeToday: ObserveTodayAttendanceUseCase,
    observeSession: ObserveSessionUseCase,
    private val punchClock: PunchClockUseCase,
    private val evaluateGeofence: EvaluateGeofenceUseCase,
    private val locationClient: LocationClient,
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

    /**
     * A kiosk QR code was scanned; complete the punch with it.
     *
     * Results come in through explicit calls rather than this ViewModel reading
     * a SavedStateHandle: the handle a navigation result is written to (the
     * NavBackStackEntry's own) is a different object from the one injected
     * here, so a value set there would never arrive.
     */
    fun onKioskTokenScanned(kioskToken: String) = punchWithQr(kioskToken)

    /**
     * The server confirmed the employee's face. [faceToken] is its signed proof
     * when the backend issued one; the punch still goes through without it and
     * is simply recorded as unverified.
     */
    fun onFaceVerified(faceToken: String?) = punchWithFace(faceToken)

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

    /**
     * Punch verified by face recognition, carrying the server's signed proof.
     *
     * The user has just been told "face verified", so a location that went stale
     * in the meantime must be reported — silently doing nothing would leave them
     * believing they had checked in.
     */
    private fun punchWithFace(faceToken: String?) {
        viewModelScope.launch {
            // Coming back from the camera restarts the location fix, so it is
            // usually still arriving at this moment. Wait for it rather than
            // discarding a verification the user has just completed — and only
            // report failure if no fix turns up at all.
            val ready = withTimeoutOrNull(LOCATION_WAIT_MS) {
                _uiState
                    .map { it.location }
                    .filterIsInstance<LocationUiState.Ready>()
                    .first()
            }
            if (ready == null) {
                _effects.send(PunchEffect.LocationLost)
                return@launch
            }
            val nextType = nextPunchType() ?: return@launch
            submit(
                PunchCommand(
                    type = nextType,
                    method = PunchMethod.FACE,
                    latitude = ready.location.latitude,
                    longitude = ready.location.longitude,
                    accuracyMeters = ready.location.accuracyMeters,
                    isMockLocation = ready.location.isMock,
                    faceToken = faceToken,
                ),
            )
        }
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

    private companion object {
        /** How long a face-verified punch waits for a GPS fix before giving up. */
        const val LOCATION_WAIT_MS = 15_000L
    }
}
