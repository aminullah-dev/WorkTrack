package app.worktrack.feature.leave.overview

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BeachAccess
import androidx.compose.material3.Card
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.ColorDotChip
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.l10n.formatShamsiRange
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.designsystem.l10n.localizedMessage
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.LeaveRequest
import app.worktrack.core.model.LeaveStatus
import app.worktrack.core.model.LeaveType
import app.worktrack.core.model.SyncStatus
import app.worktrack.feature.leave.R

@Composable
fun LeaveOverviewRoute(
    onApplyClick: () -> Unit,
    onApprovalsClick: () -> Unit,
    viewModel: LeaveOverviewViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.effects.collect { effect ->
            when (effect) {
                LeaveOverviewEffect.Cancelled ->
                    snackbarHostState.showSnackbar(context.getString(R.string.leave_msg_cancelled))

                is LeaveOverviewEffect.Failed ->
                    snackbarHostState.showSnackbar(effect.error.localizedMessage(context))
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onApplyClick,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text(stringResource(R.string.leave_apply)) },
            )
        },
    ) { padding ->
        LeaveOverviewScreen(
            state = state,
            onApprovalsClick = onApprovalsClick,
            onCancelRequest = viewModel::onCancelRequest,
            modifier = Modifier.padding(padding),
        )
    }
}

@Composable
internal fun LeaveOverviewScreen(
    state: LeaveOverviewUiState,
    onApprovalsClick: () -> Unit,
    onCancelRequest: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (state.isApprover) {
            item {
                Card(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                ) {
                    Row(
                        Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = stringResource(R.string.leave_pending_team),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = onApprovalsClick) {
                            Text(stringResource(R.string.leave_review))
                        }
                    }
                }
            }
        }

        item { SectionHeader(stringResource(R.string.leave_balances)) }
        item {
            BalanceRow(balances = state.overview.balances, typeOf = { state.overview.typeOf(it) })
        }

        item { SectionHeader(stringResource(R.string.leave_my_requests)) }
        if (state.overview.myRequests.isEmpty()) {
            item {
                EmptyState(
                    icon = Icons.Filled.BeachAccess,
                    title = stringResource(R.string.leave_empty_title),
                    message = stringResource(R.string.leave_empty_msg),
                    modifier = Modifier.height(280.dp),
                )
            }
        } else {
            items(state.overview.myRequests, key = { it.id }) { request ->
                RequestCard(
                    request = request,
                    type = state.overview.typeOf(request.leaveTypeId),
                    onCancel = { onCancelRequest(request.id) },
                )
            }
        }
        item { Spacer(Modifier.height(80.dp)) } // clear the FAB
    }
}

@Composable
private fun BalanceRow(
    balances: List<LeaveBalance>,
    typeOf: (String) -> LeaveType?,
) {
    if (balances.isEmpty()) {
        Text(
            text = stringResource(R.string.leave_balances_after_sync),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        return
    }
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(balances, key = { it.id }) { balance ->
            val type = typeOf(balance.leaveTypeId)
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        text = localizedDigits("%.1f".format(balance.availableDays)),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = type?.name ?: stringResource(R.string.leave_generic_type),
                        style = MaterialTheme.typography.labelMedium,
                    )
                    if (balance.pendingDays > 0) {
                        Text(
                            text = localizedDigits(
                                stringResource(
                                    R.string.leave_days_pending,
                                    "%.1f".format(balance.pendingDays),
                                ),
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RequestCard(
    request: LeaveRequest,
    type: LeaveType?,
    onCancel: () -> Unit,
) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    type?.let {
                        ColorDotChip(
                            text = it.name,
                            dotColor = parseHexColor(it.colorHex),
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = formatShamsiRange(request.startDate, request.endDate) +
                            " · " +
                            localizedDigits(
                                stringResource(
                                    R.string.leave_days_count,
                                    "%.1f".format(request.days),
                                ),
                            ),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = request.reason,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
                StatusChip(text = request.status.label(), tone = request.status.tone())
            }
            if (request.syncStatus == SyncStatus.PENDING) {
                Text(
                    text = stringResource(R.string.leave_waiting_sync),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (request.syncStatus == SyncStatus.FAILED) {
                Text(
                    text = stringResource(R.string.leave_sync_failed),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            if (request.status == LeaveStatus.PENDING && request.syncStatus == SyncStatus.SYNCED) {
                TextButton(onClick = onCancel) {
                    Text(stringResource(R.string.leave_cancel_request))
                }
            }
        }
    }
}

@Composable
internal fun LeaveStatus.label(): String = stringResource(
    when (this) {
        LeaveStatus.DRAFT -> R.string.leave_status_draft
        LeaveStatus.PENDING -> R.string.leave_status_pending
        LeaveStatus.APPROVED -> R.string.leave_status_approved
        LeaveStatus.REJECTED -> R.string.leave_status_rejected
        LeaveStatus.CANCELLED -> R.string.leave_status_cancelled
    },
)

internal fun LeaveStatus.tone(): ChipTone = when (this) {
    LeaveStatus.APPROVED -> ChipTone.POSITIVE
    LeaveStatus.PENDING, LeaveStatus.DRAFT -> ChipTone.WARNING
    LeaveStatus.REJECTED -> ChipTone.NEGATIVE
    LeaveStatus.CANCELLED -> ChipTone.NEUTRAL
}

internal fun parseHexColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: IllegalArgumentException) {
    Color(0xFF607D8B)
}
