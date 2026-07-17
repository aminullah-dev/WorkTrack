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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.component.WtTextField
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.model.ApprovalDecision
import app.worktrack.core.model.LeaveRequest
import java.time.format.DateTimeFormatter

@Composable
fun ApprovalsRoute(
    onBack: () -> Unit,
    viewModel: ApprovalsViewModel = hiltViewModel(),
) {
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val deciding by viewModel.deciding.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    var rejectTarget by remember { mutableStateOf<LeaveRequest?>(null) }

    LaunchedEffect(Unit) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(
        topBar = { WtTopBar(title = "Approvals", onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (pending.isEmpty()) {
            EmptyState(
                icon = Icons.Filled.Inbox,
                title = "All caught up",
                message = "No leave requests are waiting for your decision.",
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
            employeeName = target.employeeName ?: "this employee",
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
    val dateFormat = DateTimeFormatter.ofPattern("d MMM")
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
                text = "${request.startDate.format(dateFormat)} – " +
                    "${request.endDate.format(dateFormat)} · %.1f days".format(request.days),
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
                    text = "Approve",
                    onClick = onApprove,
                    modifier = Modifier.weight(1f),
                    loading = busy,
                )
                Spacer(Modifier.width(8.dp))
                WtSecondaryButton(
                    text = "Reject",
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
        title = { Text("Reject request") },
        text = {
            Column {
                Text("Tell $employeeName why this request is being rejected.")
                Spacer(Modifier.height(8.dp))
                WtTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = "Reason",
                    singleLine = false,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(note) },
                enabled = note.isNotBlank(),
            ) { Text("Reject") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
