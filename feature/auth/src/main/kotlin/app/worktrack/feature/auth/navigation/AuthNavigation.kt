package app.worktrack.feature.auth.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navigation
import app.worktrack.feature.auth.LoginRoute

const val AUTH_GRAPH_ROUTE = "auth"
const val LOGIN_ROUTE = "auth/login"

fun NavGraphBuilder.authGraph() {
    navigation(startDestination = LOGIN_ROUTE, route = AUTH_GRAPH_ROUTE) {
        composable(route = LOGIN_ROUTE) {
            LoginRoute()
        }
    }
}
