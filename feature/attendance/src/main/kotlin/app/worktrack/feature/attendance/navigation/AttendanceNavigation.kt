package app.worktrack.feature.attendance.navigation

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

const val PUNCH_ROUTE = "attendance/punch"
const val QR_SCAN_ROUTE = "attendance/qr-scan"
const val ATTENDANCE_HISTORY_ROUTE = "attendance/history"
const val FACE_ENROLL_ROUTE = "attendance/face-enroll"
const val FACE_VERIFY_ROUTE = "attendance/face-verify"

fun NavGraphBuilder.attendanceScreens(navController: NavController) {
    composable(route = PUNCH_ROUTE) {
        PunchRoute(
            onBack = { navController.popBackStack() },
            onScanQr = { navController.navigate(QR_SCAN_ROUTE) },
            onVerifyFace = { navController.navigate(FACE_VERIFY_ROUTE) },
            onEnrollFace = { navController.navigate(FACE_ENROLL_ROUTE) },
        )
    }

    composable(route = QR_SCAN_ROUTE) {
        QrScanRoute(
            onBack = { navController.popBackStack() },
            onTokenScanned = { token ->
                // Hand the token to the punch screen's SavedStateHandle and pop.
                navController.previousBackStackEntry
                    ?.savedStateHandle
                    ?.set(PunchViewModel.KEY_KIOSK_TOKEN, token)
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
                // Hand the server's signed proof to the punch screen, which
                // completes the check-in with it.
                navController.previousBackStackEntry
                    ?.savedStateHandle
                    ?.set(PunchViewModel.KEY_FACE_TOKEN, success.token)
                navController.popBackStack()
            },
        )
    }
}
