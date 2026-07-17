package app.worktrack.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BeachAccess
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import app.worktrack.R
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.worktrack.feature.attendance.navigation.PUNCH_ROUTE
import app.worktrack.feature.attendance.navigation.ATTENDANCE_HISTORY_ROUTE
import app.worktrack.feature.attendance.navigation.attendanceScreens
import app.worktrack.feature.dashboard.navigation.DASHBOARD_ROUTE
import app.worktrack.feature.dashboard.navigation.dashboardScreen
import app.worktrack.feature.leave.navigation.LEAVE_ROUTE
import app.worktrack.feature.leave.navigation.leaveScreens
import app.worktrack.feature.payslips.navigation.PAYSLIPS_ROUTE
import app.worktrack.feature.payslips.navigation.payslipScreens
import app.worktrack.feature.profile.navigation.PROFILE_ROUTE
import app.worktrack.feature.profile.navigation.profileScreen

private data class TopLevelDestination(
    val route: String,
    val labelRes: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
)

private val topLevelDestinations = listOf(
    TopLevelDestination(DASHBOARD_ROUTE, R.string.nav_home, Icons.Filled.Home, Icons.Outlined.Home),
    TopLevelDestination(PUNCH_ROUTE, R.string.nav_attendance, Icons.Filled.Fingerprint, Icons.Outlined.Fingerprint),
    TopLevelDestination(LEAVE_ROUTE, R.string.nav_leave, Icons.Filled.BeachAccess, Icons.Outlined.BeachAccess),
    TopLevelDestination(PROFILE_ROUTE, R.string.nav_profile, Icons.Filled.Person, Icons.Outlined.Person),
)

@Composable
fun MainScaffold() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    val showBottomBar = currentDestination?.route in topLevelDestinations.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    topLevelDestinations.forEach { destination ->
                        val selected = currentDestination
                            ?.hierarchy
                            ?.any { it.route == destination.route } == true
                        val label = stringResource(destination.labelRes)
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(destination.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(
                                    imageVector = if (selected) {
                                        destination.selectedIcon
                                    } else {
                                        destination.unselectedIcon
                                    },
                                    contentDescription = label,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = DASHBOARD_ROUTE,
            modifier = Modifier.padding(padding),
        ) {
            dashboardScreen(
                onPunchClick = { navController.navigate(PUNCH_ROUTE) },
                onAttendanceHistoryClick = { navController.navigate(ATTENDANCE_HISTORY_ROUTE) },
            )
            attendanceScreens(navController)
            leaveScreens(navController)
            payslipScreens(navController)
            profileScreen(
                onPayslipsClick = { navController.navigate(PAYSLIPS_ROUTE) },
            )
        }
    }
}
