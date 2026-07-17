package app.worktrack.feature.profile

import androidx.appcompat.app.AppCompatDelegate
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.FullScreenLoading
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.l10n.appLocale
import app.worktrack.core.designsystem.l10n.formatShamsiDateTime
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.model.RoleCode
import app.worktrack.core.model.SyncState
import app.worktrack.core.model.UserSession

/** App language options; tags feed AppCompatDelegate.setApplicationLocales. */
private enum class AppLanguage(val tag: String, val labelRes: Int) {
    DARI("fa-AF", R.string.prof_lang_dari),
    PASHTO("ps-AF", R.string.prof_lang_pashto),
    ENGLISH("en", R.string.prof_lang_english),
}

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
        onLanguageSelect = { language ->
            AppCompatDelegate.setApplicationLocales(
                LocaleListCompat.forLanguageTags(language),
            )
        },
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
    onLanguageSelect: (String) -> Unit,
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
                        StatusChip(text = role.label(), tone = ChipTone.NEUTRAL)
                    }
                }
            }
        }

        SectionHeader(stringResource(R.string.prof_language))
        LanguageRow(onLanguageSelect = onLanguageSelect)

        SectionHeader(stringResource(R.string.prof_payroll))
        WtSecondaryButton(
            text = stringResource(R.string.prof_my_payslips),
            onClick = onPayslipsClick,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(8.dp))

        SectionHeader(stringResource(R.string.prof_sync))
        Card(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
        ) {
            Column(Modifier.padding(16.dp)) {
                SyncStatusRow(syncState)
                Spacer(Modifier.height(12.dp))
                WtSecondaryButton(
                    text = stringResource(R.string.prof_sync_now),
                    onClick = onSyncNow,
                )
            }
        }

        Spacer(Modifier.height(24.dp))
        WtPrimaryButton(
            text = stringResource(R.string.prof_sign_out),
            onClick = onSignOut,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            loading = isSigningOut,
        )
    }
}

@Composable
private fun LanguageRow(onLanguageSelect: (String) -> Unit) {
    val currentLanguage = appLocale().language
    Row(
        modifier = Modifier.padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AppLanguage.entries.forEach { language ->
            FilterChip(
                selected = language.tag.startsWith(currentLanguage),
                onClick = { onLanguageSelect(language.tag) },
                label = { Text(stringResource(language.labelRes)) },
            )
        }
    }
}

@Composable
private fun SyncStatusRow(syncState: SyncState?) {
    if (syncState == null) {
        Text(
            text = stringResource(R.string.prof_sync_unavailable),
            style = MaterialTheme.typography.bodyMedium,
        )
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                text = when {
                    syncState.isSyncing -> stringResource(R.string.prof_syncing)
                    syncState.pendingOperations > 0 -> localizedDigits(
                        stringResource(
                            R.string.prof_pending_changes,
                            syncState.pendingOperations.toString(),
                        ),
                    )

                    else -> stringResource(R.string.prof_up_to_date)
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            syncState.lastSuccessAt?.let {
                Text(
                    text = stringResource(R.string.prof_last_synced, formatShamsiDateTime(it)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (syncState.failedOperations > 0) {
                Text(
                    text = localizedDigits(
                        stringResource(
                            R.string.prof_rejected_changes,
                            syncState.failedOperations.toString(),
                        ),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        StatusChip(
            text = stringResource(
                when {
                    syncState.isSyncing -> R.string.prof_chip_syncing
                    syncState.failedOperations > 0 -> R.string.prof_chip_attention
                    syncState.pendingOperations > 0 -> R.string.prof_chip_pending
                    else -> R.string.prof_chip_ok
                },
            ),
            tone = when {
                syncState.failedOperations > 0 -> ChipTone.NEGATIVE
                syncState.pendingOperations > 0 || syncState.isSyncing -> ChipTone.WARNING
                else -> ChipTone.POSITIVE
            },
        )
    }
}

@Composable
private fun RoleCode.label(): String = stringResource(
    when (this) {
        RoleCode.SUPER_ADMIN -> R.string.prof_role_super_admin
        RoleCode.COMPANY_ADMIN -> R.string.prof_role_company_admin
        RoleCode.HR_ADMIN -> R.string.prof_role_hr_admin
        RoleCode.PAYROLL_ADMIN -> R.string.prof_role_payroll_admin
        RoleCode.BRANCH_MANAGER -> R.string.prof_role_branch_manager
        RoleCode.TEAM_LEAD -> R.string.prof_role_team_lead
        RoleCode.EMPLOYEE -> R.string.prof_role_employee
        RoleCode.AUDITOR -> R.string.prof_role_auditor
        RoleCode.KIOSK -> R.string.prof_role_kiosk
    },
)
