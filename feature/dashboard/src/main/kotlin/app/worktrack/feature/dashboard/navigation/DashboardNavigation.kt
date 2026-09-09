package app.worktrack.feature.dashboard.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.worktrack.feature.dashboard.DashboardRoute

const val DASHBOARD_ROUTE = "dashboard"

fun NavGraphBuilder.dashboardScreen(
    onPunchClick: () -> Unit,
    onAttendanceHistoryClick: () -> Unit,
) {
    composable(route = DASHBOARD_ROUTE) {
        DashboardRoute(
            onPunchClick = onPunchClick,
            onAttendanceHistoryClick = onAttendanceHistoryClick,
        )
    }
}
