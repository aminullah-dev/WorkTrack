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
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.model.PunchType

@Composable
fun PunchRoute(
    onBack: () -> Unit,
    onScanQr: () -> Unit,
    viewModel: PunchViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val today by viewModel.today.collectAsStateWithLifecycle()
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
                is PunchEffect.Message -> snackbarHostState.showSnackbar(effect.text)
                is PunchEffect.PunchRecorded -> snackbarHostState.showSnackbar(
                    if (effect.type == PunchType.IN) {
                        "Clocked in — will sync automatically"
                    } else {
                        "Clocked out — will sync automatically"
                    },
                )
            }
        }
    }

    Scaffold(
        topBar = { WtTopBar(title = "Attendance punch", onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PunchScreen(
            state = state,
            clockedIn = today?.clockedIn == true,
            onPunch = viewModel::onPunch,
            onRetryLocation = {
                permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            },
            onScanQr = onScanQr,
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
            text = if (clockedIn) "Clock out" else "Clock in",
            onClick = onPunch,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.location is LocationUiState.Ready,
            loading = state.isPunching,
        )

        Spacer(Modifier.height(16.dp))

        WtSecondaryButton(
            text = "Scan kiosk QR instead",
            onClick = onScanQr,
            modifier = Modifier.fillMaxWidth(),
        )
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
                    Text("Location permission needed", style = MaterialTheme.typography.titleMedium)
                }

                LocationUiState.Acquiring -> {
                    Text("Getting your location…", style = MaterialTheme.typography.titleMedium)
                }

                is LocationUiState.Ready -> {
                    val evaluation = location.evaluation
                    when {
                        !evaluation.fencesConfigured -> StatusChip("No geofence required", ChipTone.NEUTRAL)
                        evaluation.insideFence -> StatusChip(
                            "Inside ${evaluation.nearestFence?.name ?: "work area"}",
                            ChipTone.POSITIVE,
                        )

                        else -> StatusChip(
                            "Outside work area (${evaluation.distanceMeters?.toInt() ?: "?"} m away)",
                            ChipTone.NEGATIVE,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Accuracy ±${location.location.accuracyMeters.toInt()} m",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                is LocationUiState.Unavailable -> {
                    Text(
                        text = location.reason,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(8.dp))
                    WtSecondaryButton(text = "Retry", onClick = onRetry)
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
