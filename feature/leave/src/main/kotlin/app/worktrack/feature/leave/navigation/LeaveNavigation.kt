package app.worktrack.feature.leave.navigation

import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import app.worktrack.feature.leave.apply.ApplyLeaveRoute
import app.worktrack.feature.leave.approvals.ApprovalsRoute
import app.worktrack.feature.leave.overview.LeaveOverviewRoute

const val LEAVE_ROUTE = "leave"
const val APPLY_LEAVE_ROUTE = "leave/apply"
const val APPROVALS_ROUTE = "leave/approvals"

fun NavGraphBuilder.leaveScreens(navController: NavController) {
    composable(route = LEAVE_ROUTE) {
        LeaveOverviewRoute(
            onApplyClick = { navController.navigate(APPLY_LEAVE_ROUTE) },
            onApprovalsClick = { navController.navigate(APPROVALS_ROUTE) },
        )
    }

    composable(route = APPLY_LEAVE_ROUTE) {
        ApplyLeaveRoute(onBack = { navController.popBackStack() })
    }

    composable(
        route = APPROVALS_ROUTE,
        deepLinks = listOf(navDeepLink { uriPattern = "worktrack://approvals" }),
    ) {
        ApprovalsRoute(onBack = { navController.popBackStack() })
    }
}
