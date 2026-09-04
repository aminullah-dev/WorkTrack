package app.worktrack.feature.attendance.punch

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.designsystem.l10n.localizedMessage
import app.worktrack.core.model.PunchType
import app.worktrack.feature.attendance.R

@Composable
fun PunchRoute(
    onBack: () -> Unit,
    onScanQr: () -> Unit,
    onVerifyFace: () -> Unit,
    onEnrollFace: () -> Unit,
    viewModel: PunchViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val today by viewModel.today.collectAsStateWithLifecycle()
    val faceRequired by viewModel.faceRequired.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) viewModel.onLocationPermissionGranted() else viewModel.onLocationPermissionDenied()
    }

    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            viewModel.onLocationPermissionGranted()
        } else {
            permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is PunchEffect.Failed ->
                    snackbarHostState.showSnackbar(effect.error.localizedMessage(context))

                is PunchEffect.LocationLost -> snackbarHostState.showSnackbar(
                    context.getString(R.string.att_punch_location_lost),
                )

                is PunchEffect.PunchRecorded -> snackbarHostState.showSnackbar(
                    context.getString(
                        if (effect.type == PunchType.IN) {
                            R.string.att_punch_in_recorded
                        } else {
                            R.string.att_punch_out_recorded
                        },
                    ),
                )
            }
        }
    }

    Scaffold(
        topBar = { WtTopBar(title = stringResource(R.string.att_punch_title), onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PunchScreen(
            state = state,
            clockedIn = today?.clockedIn == true,
            // Plain GPS check-in always works; face verification is a separate,
            // optional action so a finicky match never blocks attendance.
            onPunch = viewModel::onPunch,
            onRetryLocation = {
                permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            },
            onScanQr = onScanQr,
            faceRequired = faceRequired,
            onVerifyFace = onVerifyFace,
            onEnrollFace = onEnrollFace,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun PunchScreen(
    state: PunchUiState,
    clockedIn: Boolean,
    onPunch: () -> Unit,
    onRetryLocation: () -> Unit,
    onScanQr: () -> Unit,
    faceRequired: Boolean = false,
    onVerifyFace: () -> Unit = {},
    onEnrollFace: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LocationStatusCard(state.location, onRetryLocation)

        Spacer(Modifier.height(32.dp))

        WtPrimaryButton(
            text = stringResource(if (clockedIn) R.string.att_clock_out else R.string.att_clock_in),
            onClick = onPunch,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.location is LocationUiState.Ready,
            loading = state.isPunching,
        )

        Spacer(Modifier.height(16.dp))

        WtSecondaryButton(
            text = stringResource(R.string.att_scan_qr),
            onClick = onScanQr,
            modifier = Modifier.fillMaxWidth(),
        )

        if (faceRequired) {
            Spacer(Modifier.height(16.dp))
            WtSecondaryButton(
                text = stringResource(R.string.att_face_verify_title),
                onClick = onVerifyFace,
                modifier = Modifier.fillMaxWidth(),
                enabled = state.location is LocationUiState.Ready,
            )
            Spacer(Modifier.height(16.dp))
            WtSecondaryButton(
                text = stringResource(R.string.att_face_enroll_title),
                onClick = onEnrollFace,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun LocationStatusCard(
    location: LocationUiState,
    onRetry: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (location) {
                LocationUiState.PermissionRequired -> {
                    Text(
                        text = stringResource(R.string.att_location_permission_needed),
                        style = MaterialTheme.typography.titleMedium,
                    )
                }

                LocationUiState.Acquiring -> {
                    Text(
                        text = stringResource(R.string.att_getting_location),
                        style = MaterialTheme.typography.titleMedium,
                    )
                }

                is LocationUiState.Ready -> {
                    val evaluation = location.evaluation
                    when {
                        !evaluation.fencesConfigured -> StatusChip(
                            stringResource(R.string.att_no_geofence),
                            ChipTone.NEUTRAL,
                        )

                        evaluation.insideFence -> StatusChip(
                            stringResource(
                                R.string.att_inside_fence,
                                evaluation.nearestFence?.name.orEmpty(),
                            ),
                            ChipTone.POSITIVE,
                        )

                        else -> StatusChip(
                            localizedDigits(
                                stringResource(
                                    R.string.att_outside_fence,
                                    (evaluation.distanceMeters?.toInt() ?: 0).toString(),
                                ),
                            ),
                            ChipTone.NEGATIVE,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = localizedDigits(
                            stringResource(
                                R.string.att_accuracy,
                                location.location.accuracyMeters.toInt().toString(),
                            ),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                is LocationUiState.Unavailable -> {
                    Text(
                        text = stringResource(
                            when (location.reason) {
                                LocationUnavailableReason.PERMISSION_DENIED ->
                                    R.string.att_loc_unavailable_permission

                                LocationUnavailableReason.NO_FIX ->
                                    R.string.att_loc_unavailable_no_fix
                            },
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(8.dp))
                    WtSecondaryButton(
                        text = stringResource(app.worktrack.core.designsystem.R.string.ds_retry),
                        onClick = onRetry,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Icon(
                imageVector = Icons.Filled.QrCodeScanner,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
