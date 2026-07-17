package app.worktrack.feature.leave.approvals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.component.WtTextField
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.designsystem.l10n.formatShamsiRange
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.designsystem.l10n.localizedMessage
import app.worktrack.core.model.ApprovalDecision
import app.worktrack.core.model.LeaveRequest
import app.worktrack.feature.leave.R

@Composable
fun ApprovalsRoute(
    onBack: () -> Unit,
    viewModel: ApprovalsViewModel = hiltViewModel(),
) {
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val deciding by viewModel.deciding.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    var rejectTarget by remember { mutableStateOf<LeaveRequest?>(null) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is ApprovalsEffect.Decided -> snackbarHostState.showSnackbar(
                    context.getString(
                        if (effect.decision == ApprovalDecision.APPROVE) {
                            R.string.leave_msg_approved
                        } else {
                            R.string.leave_msg_rejected
                        },
                    ),
                )

                is ApprovalsEffect.Failed ->
                    snackbarHostState.showSnackbar(effect.error.localizedMessage(context))
            }
        }
    }

    Scaffold(
        topBar = { WtTopBar(title = stringResource(R.string.leave_approvals_title), onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (pending.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.Inbox,
                title = stringResource(R.string.leave_approvals_empty_title),
                message = stringResource(R.string.leave_approvals_empty_msg),
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(pending, key = { it.id }) { request ->
                    ApprovalCard(
                        request = request,
                        busy = request.id in deciding,
                        onApprove = {
                            viewModel.onDecide(request.id, ApprovalDecision.APPROVE, note = null)
                        },
                        onReject = { rejectTarget = request },
                    )
                }
            }
        }
    }

    rejectTarget?.let { target ->
        RejectDialog(
            employeeName = target.employeeName ?: target.employeeId,
            onConfirm = { note ->
                viewModel.onDecide(target.id, ApprovalDecision.REJECT, note)
                rejectTarget = null
            },
            onDismiss = { rejectTarget = null },
        )
    }
}

@Composable
private fun ApprovalCard(
    request: LeaveRequest,
    busy: Boolean,
    onApprove: () -> Unit,
    onReject: () -> Unit,
) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                text = request.employeeName ?: request.employeeId,
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                text = formatShamsiRange(request.startDate, request.endDate) +
                    " · " +
                    localizedDigits(
                        stringResource(R.string.leave_days_count, "%.1f".format(request.days)),
                    ),
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = request.reason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Row {
                WtPrimaryButton(
                    text = stringResource(R.string.leave_approve),
                    onClick = onApprove,
                    modifier = Modifier.weight(1f),
                    loading = busy,
                )
                Spacer(Modifier.width(8.dp))
                WtSecondaryButton(
                    text = stringResource(R.string.leave_reject),
                    onClick = onReject,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
            }
        }
    }
}

@Composable
private fun RejectDialog(
    employeeName: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.leave_reject_dialog_title)) },
        text = {
            Column {
                Text(stringResource(R.string.leave_reject_dialog_msg, employeeName))
                Spacer(Modifier.height(8.dp))
                WtTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = stringResource(R.string.leave_reject_reason),
                    singleLine = false,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(note) },
                enabled = note.isNotBlank(),
            ) { Text(stringResource(R.string.leave_reject)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(app.worktrack.core.designsystem.R.string.ds_cancel))
            }
        },
    )
}
