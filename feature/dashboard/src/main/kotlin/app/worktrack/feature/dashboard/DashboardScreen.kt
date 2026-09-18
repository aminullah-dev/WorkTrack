package app.worktrack.feature.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.FullScreenLoading
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtSecondaryButton
import app.worktrack.core.designsystem.l10n.formatClockTime
import app.worktrack.core.designsystem.l10n.formatShamsiDate
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.domain.usecase.dashboard.DashboardSnapshot
import app.worktrack.core.model.Announcement
import app.worktrack.core.model.AnnouncementPriority
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.TaskStatus
import app.worktrack.core.model.WorkDay
import app.worktrack.core.model.WorkTask

@Composable
fun DashboardRoute(
    onPunchClick: () -> Unit,
    onAttendanceHistoryClick: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val statusError by viewModel.statusError.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val offlineMessage = stringResource(R.string.dash_work_offline)

    LaunchedEffect(statusError) {
        if (statusError) {
            snackbar.showSnackbar(offlineMessage)
            viewModel.onStatusErrorShown()
        }
    }

    Box(Modifier.fillMaxSize()) {
        when (val s = state) {
            DashboardUiState.Loading -> FullScreenLoading()
            is DashboardUiState.Ready -> DashboardScreen(
                snapshot = s.snapshot,
                onPunchClick = onPunchClick,
                onAttendanceHistoryClick = onAttendanceHistoryClick,
                onTaskStatus = viewModel::onTaskStatus,
            )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
internal fun DashboardScreen(
    snapshot: DashboardSnapshot,
    onPunchClick: () -> Unit,
    onAttendanceHistoryClick: () -> Unit,
    onTaskStatus: (String, TaskStatus) -> Unit = { _, _ -> },
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    text = stringResource(
                        R.string.dash_greeting,
                        snapshot.session.displayName.substringBefore(' '),
                    ),
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    text = snapshot.session.companyName,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            TodayCard(
                snapshot = snapshot,
                onPunchClick = onPunchClick,
                onAttendanceHistoryClick = onAttendanceHistoryClick,
            )
        }

        // Above leave and announcements on purpose: this is what the worker
        // opened the app to find out, and it is useless once he has walked past
        // the wrong part of the site.
        item { SectionHeader(stringResource(R.string.dash_work_today)) }
        item { WorkDayCard(snapshot.myWork.today, isToday = true, onTaskStatus = onTaskStatus) }

        snapshot.myWork.next?.let { next ->
            item {
                SectionHeader(
                    stringResource(R.string.dash_work_next, formatShamsiDate(next.date, withWeekday = true)),
                )
            }
            item { WorkDayCard(next, isToday = false, onTaskStatus = onTaskStatus) }
        }

        if (snapshot.leaveBalances.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.dash_leave_balances)) }
            item { BalancesRow(snapshot.leaveBalances) }
        }

        if (snapshot.announcements.isNotEmpty()) {
            item { SectionHeader(stringResource(R.string.dash_announcements)) }
            items(snapshot.announcements, key = { it.id }) { announcement ->
                AnnouncementCard(announcement)
            }
        }

        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun TodayCard(
    snapshot: DashboardSnapshot,
    onPunchClick: () -> Unit,
    onAttendanceHistoryClick: () -> Unit,
) {
    val today = snapshot.today
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = stringResource(
                            if (today.clockedIn) R.string.dash_clocked_in else R.string.dash_not_clocked_in,
                        ),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    today.firstInAt?.let {
                        Text(
                            text = stringResource(R.string.dash_first_in, formatClockTime(it)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = localizedDigits(
                            stringResource(
                                R.string.dash_worked,
                                (today.workedMinutesSoFar / 60).toString(),
                                (today.workedMinutesSoFar % 60).toString(),
                            ),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusChip(
                    text = stringResource(
                        if (today.clockedIn) R.string.dash_chip_in else R.string.dash_chip_out,
                    ),
                    tone = if (today.clockedIn) ChipTone.POSITIVE else ChipTone.NEUTRAL,
                )
            }

            today.shift?.let { shift ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = localizedDigits(
                        stringResource(
                            R.string.dash_shift,
                            shift.name,
                            shift.startTime.toString(),
                            shift.endTime.toString(),
                        ),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(12.dp))
            Row {
                WtPrimaryButton(
                    text = stringResource(
                        if (today.clockedIn) R.string.dash_clock_out else R.string.dash_clock_in,
                    ),
                    onClick = onPunchClick,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(12.dp))
                WtSecondaryButton(
                    text = stringResource(R.string.dash_history),
                    onClick = onAttendanceHistoryClick,
                )
            }
        }
    }
}

@Composable
private fun BalancesRow(balances: List<LeaveBalance>) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(balances, key = { it.id }) { balance ->
            Card {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        text = localizedDigits("%.1f".format(balance.availableDays)),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = stringResource(R.string.dash_days_available),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun AnnouncementCard(announcement: Announcement) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = announcement.title,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                if (announcement.priority != AnnouncementPriority.NORMAL) {
                    StatusChip(
                        text = stringResource(
                            if (announcement.priority == AnnouncementPriority.URGENT) {
                                R.string.dash_priority_urgent
                            } else {
                                R.string.dash_priority_important
                            },
                        ),
                        tone = if (announcement.priority == AnnouncementPriority.URGENT) {
                            ChipTone.NEGATIVE
                        } else {
                            ChipTone.WARNING
                        },
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = announcement.body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * One day of assigned work.
 *
 * An empty day says so in words. A blank card would be read as "the app is
 * broken" or, worse, as "nothing to do" — and the two are not the same thing.
 */
@Composable
private fun WorkDayCard(
    day: WorkDay,
    isToday: Boolean,
    onTaskStatus: (String, TaskStatus) -> Unit,
) {
    if (day.tasks.isEmpty()) {
        Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            Text(
                text = stringResource(
                    if (isToday) R.string.dash_work_none_today else R.string.dash_work_none_next,
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(16.dp),
            )
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        day.tasks.forEach { task ->
            TaskCard(task = task, actionable = isToday, onTaskStatus = onTaskStatus)
        }
    }
}

@Composable
private fun TaskCard(
    task: WorkTask,
    actionable: Boolean,
    onTaskStatus: (String, TaskStatus) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(text = task.title, style = MaterialTheme.typography.titleMedium)
                    // The project and the place: which part of the job, and where.
                    Text(
                        text = listOfNotNull(task.projectName, task.location).joinToString(" — "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusChip(text = statusLabel(task.status), tone = statusTone(task.status))
            }

            task.detail?.let {
                Spacer(Modifier.height(6.dp))
                Text(text = it, style = MaterialTheme.typography.bodyMedium)
            }

            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusChip(
                    text = stringResource(
                        if (task.isTeamWork) R.string.dash_work_team else R.string.dash_work_solo,
                    ),
                    tone = ChipTone.NEUTRAL,
                )
                task.teamName?.let {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (task.isTeamWork) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = stringResource(
                        R.string.dash_work_with,
                        task.assigneeNames.joinToString("، "),
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Only today's work can be reported on: marking tomorrow's job
            // finished today is never something the worker meant to do.
            if (actionable && task.status != TaskStatus.DONE) {
                Spacer(Modifier.height(12.dp))
                Row {
                    if (task.status != TaskStatus.IN_PROGRESS) {
                        WtSecondaryButton(
                            text = stringResource(R.string.dash_work_start),
                            onClick = { onTaskStatus(task.id, TaskStatus.IN_PROGRESS) },
                        )
                        Spacer(Modifier.width(12.dp))
                    }
                    WtPrimaryButton(
                        text = stringResource(R.string.dash_work_finish),
                        onClick = { onTaskStatus(task.id, TaskStatus.DONE) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun statusLabel(status: TaskStatus): String = stringResource(
    when (status) {
        TaskStatus.PLANNED -> R.string.dash_work_status_planned
        TaskStatus.IN_PROGRESS -> R.string.dash_work_status_in_progress
        TaskStatus.DONE -> R.string.dash_work_status_done
        TaskStatus.BLOCKED -> R.string.dash_work_status_blocked
    },
)

private fun statusTone(status: TaskStatus): ChipTone = when (status) {
    TaskStatus.PLANNED -> ChipTone.NEUTRAL
    TaskStatus.IN_PROGRESS -> ChipTone.WARNING
    TaskStatus.DONE -> ChipTone.POSITIVE
    TaskStatus.BLOCKED -> ChipTone.NEGATIVE
}
