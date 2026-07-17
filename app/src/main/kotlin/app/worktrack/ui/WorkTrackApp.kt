package app.worktrack.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.rememberNavController
import app.worktrack.core.designsystem.component.FullScreenLoading
import app.worktrack.feature.auth.navigation.AUTH_GRAPH_ROUTE
import app.worktrack.feature.auth.navigation.authGraph

/**
 * Root switch between the auth and main experiences. Each state owns its own
 * NavHost, so signing out atomically drops the entire main back stack (no
 * stale tenant data can be navigated back to).
 */
@Composable
fun WorkTrackApp(viewModel: MainViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    when (state) {
        RootUiState.Loading -> FullScreenLoading(Modifier)

        RootUiState.SignedOut -> {
            val navController = rememberNavController()
            NavHost(navController = navController, startDestination = AUTH_GRAPH_ROUTE) {
                authGraph()
            }
        }

        is RootUiState.SignedIn -> MainScaffold()
    }
}
