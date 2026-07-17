package app.worktrack.feature.profile.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import app.worktrack.feature.profile.ProfileRoute

const val PROFILE_ROUTE = "profile"

fun NavGraphBuilder.profileScreen(onPayslipsClick: () -> Unit) {
    composable(route = PROFILE_ROUTE) {
        ProfileRoute(onPayslipsClick = onPayslipsClick)
    }
}
