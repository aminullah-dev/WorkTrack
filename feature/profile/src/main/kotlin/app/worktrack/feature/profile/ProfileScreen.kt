package app.worktrack.feature.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.FullScreenLoading
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.model.SyncState
import app.worktrack.core.model.UserSession
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun ProfileRoute(
    onPayslipsClick: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val session = state.session
    if (session == null) {
        FullScreenLoading()
        return
    }
    ProfileScreen(
        session = session,
        syncState = state.syncState,
        isSigningOut = state.isSigningOut,
        onPayslipsClick = onPayslipsClick,
        onSyncNow = viewModel::onSyncNow,
        onSignOut = viewModel::onSignOut,
    )
}

@Composable
internal fun ProfileScreen(
    session: UserSession,
    syncState: SyncState?,
    isSigningOut: Boolean,
    onPayslipsClick: () -> Unit,
    onSyncNow: () -> Unit,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp),
    ) {
        Card(
            Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                Text(session.displayName, style = MaterialTheme.typography.titleLarge)
                Text(
                    text = session.email,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = session.companyName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    session.roles.forEach { role ->
                        StatusChip(
                            text = role.name.replace('_', ' ').lowercase()
                                .replaceFirstChar { it.uppercase() },
                            tone = ChipTone.NEUTRAL,
                        )
                    }
                }
            }
        }

        SectionHeader("Payroll")
        WtSecondaryButton(
            text = "My payslips",
            onClick = onPayslipsClick,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(8.dp))

        SectionHeader("Sync")
        Card(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                SyncStatusRow(syncState)
                Spacer(Modifier.height(12.dp))
                WtSecondaryButton(text = "Sync now", onClick = onSyncNow)
            }
        }

        Spacer(Modifier.height(24.dp))
        WtPrimaryButton(
            text = "Sign out",
            onClick = onSignOut,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            loading = isSigningOut,
        )
    }
}

@Composable
private fun SyncStatusRow(syncState: SyncState?) {
    if (syncState == null) {
        Text("Sync status unavailable", style = MaterialTheme.typography.bodyMedium)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                text = when {
                    syncState.isSyncing -> "Syncing…"
                    syncState.pendingOperations > 0 ->
                        "${syncState.pendingOperations} changes waiting to sync"

                    else -> "Everything is up to date"
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            syncState.lastSuccessAt?.let {
                Text(
                    text = "Last synced " + DateTimeFormatter.ofPattern("d MMM HH:mm")
                        .format(it.atZone(ZoneId.systemDefault())),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (syncState.failedOperations > 0) {
                Text(
                    text = "${syncState.failedOperations} changes were rejected by the server",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        StatusChip(
            text = when {
                syncState.isSyncing -> "SYNCING"
                syncState.failedOperations > 0 -> "ATTENTION"
                syncState.pendingOperations > 0 -> "PENDING"
                else -> "OK"
            },
            tone = when {
                syncState.failedOperations > 0 -> ChipTone.NEGATIVE
                syncState.pendingOperations > 0 || syncState.isSyncing -> ChipTone.WARNING
                else -> ChipTone.POSITIVE
            },
        )
    }
}
