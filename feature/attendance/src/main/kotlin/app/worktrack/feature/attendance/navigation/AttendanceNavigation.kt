package app.worktrack.feature.attendance.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.worktrack.feature.attendance.history.AttendanceHistoryRoute
import app.worktrack.feature.attendance.punch.PunchRoute
import app.worktrack.feature.attendance.punch.PunchViewModel
import app.worktrack.feature.attendance.qr.QrScanRoute

const val PUNCH_ROUTE = "attendance/punch"
const val QR_SCAN_ROUTE = "attendance/qr-scan"
const val ATTENDANCE_HISTORY_ROUTE = "attendance/history"

fun NavGraphBuilder.attendanceScreens(navController: NavController) {
    composable(route = PUNCH_ROUTE) {
        PunchRoute(
            onBack = { navController.popBackStack() },
            onScanQr = { navController.navigate(QR_SCAN_ROUTE) },
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
}
