package app.worktrack.feature.attendance.navigation

import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.worktrack.feature.attendance.face.FaceEnrollRoute
import app.worktrack.feature.attendance.face.FaceEnrollViewModel
import app.worktrack.feature.attendance.face.FaceVerifyRoute
import app.worktrack.feature.attendance.face.FaceVerifyViewModel
import app.worktrack.feature.attendance.history.AttendanceHistoryRoute
import app.worktrack.feature.attendance.punch.PunchRoute
import app.worktrack.feature.attendance.punch.PunchViewModel
import app.worktrack.feature.attendance.qr.QrScanRoute
import kotlinx.coroutines.launch

/**
 * Keys for results the QR and face screens hand back to the punch screen.
 *
 * They live on the punch NavBackStackEntry's own SavedStateHandle, which is a
 * different object from the one Hilt injects into a ViewModel scoped to that
 * entry — so the punch screen must read them from the entry itself (see below)
 * and forward them to the ViewModel explicitly.
 */
private const val KEY_KIOSK_TOKEN = "kioskToken"
private const val KEY_FACE_TOKEN = "faceToken"
private const val KEY_FACE_VERIFIED = "faceVerified"

const val PUNCH_ROUTE = "attendance/punch"
const val QR_SCAN_ROUTE = "attendance/qr-scan"
const val ATTENDANCE_HISTORY_ROUTE = "attendance/history"
const val FACE_ENROLL_ROUTE = "attendance/face-enroll"
const val FACE_VERIFY_ROUTE = "attendance/face-verify"

fun NavGraphBuilder.attendanceScreens(navController: NavController) {
    composable(route = PUNCH_ROUTE) { entry ->
        val viewModel: PunchViewModel = hiltViewModel()

        // Read the results off the same handle the other screens wrote to, then
        // hand them to the ViewModel. Each is cleared once consumed so that
        // returning to this screen later cannot replay an old check-in.
        LaunchedEffect(entry) {
            launch {
                entry.savedStateHandle
                    .getStateFlow<String?>(KEY_KIOSK_TOKEN, null)
                    .collect { token ->
                        if (!token.isNullOrBlank()) {
                            entry.savedStateHandle[KEY_KIOSK_TOKEN] = null
                            viewModel.onKioskTokenScanned(token)
                        }
                    }
            }
            launch {
                entry.savedStateHandle
                    .getStateFlow(KEY_FACE_VERIFIED, false)
                    .collect { verified ->
                        if (verified) {
                            val token: String? = entry.savedStateHandle[KEY_FACE_TOKEN]
                            entry.savedStateHandle[KEY_FACE_VERIFIED] = false
                            entry.savedStateHandle[KEY_FACE_TOKEN] = null
                            viewModel.onFaceVerified(token)
                        }
                    }
            }
        }

        PunchRoute(
            onBack = { navController.popBackStack() },
            onScanQr = { navController.navigate(QR_SCAN_ROUTE) },
            onVerifyFace = { navController.navigate(FACE_VERIFY_ROUTE) },
            onEnrollFace = { navController.navigate(FACE_ENROLL_ROUTE) },
            viewModel = viewModel,
        )
    }

    composable(route = QR_SCAN_ROUTE) {
        QrScanRoute(
            onBack = { navController.popBackStack() },
            onTokenScanned = { token ->
                // Hand the token to the punch screen's SavedStateHandle and pop.
                navController.previousBackStackEntry
                    ?.savedStateHandle
                    ?.set(KEY_KIOSK_TOKEN, token)
                navController.popBackStack()
            },
        )
    }

    composable(route = ATTENDANCE_HISTORY_ROUTE) {
        AttendanceHistoryRoute(onBack = { navController.popBackStack() })
    }

    composable(route = FACE_ENROLL_ROUTE) {
        val viewModel: FaceEnrollViewModel = hiltViewModel()
        FaceEnrollRoute(
            onBack = { navController.popBackStack() },
            onSubmit = { embedding -> viewModel.enroll(embedding) },
            onDone = { navController.popBackStack() },
        )
    }

    composable(route = FACE_VERIFY_ROUTE) {
        val viewModel: FaceVerifyViewModel = hiltViewModel()
        FaceVerifyRoute(
            onBack = { navController.popBackStack() },
            onSubmit = { embedding -> viewModel.verify(embedding) },
            onDone = { success ->
                // Hand the result to the punch screen: the token when the server
                // issued one, and always the flag that completes the check-in.
                navController.previousBackStackEntry?.savedStateHandle?.apply {
                    set(KEY_FACE_TOKEN, success.token)
                    set(KEY_FACE_VERIFIED, true)
                }
                navController.popBackStack()
            },
        )
    }
}
