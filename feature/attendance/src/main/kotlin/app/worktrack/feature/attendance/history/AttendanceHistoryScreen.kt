package app.worktrack.feature.attendance.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.EditCalendar
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtTextField
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.designsystem.l10n.formatShamsiDate
import app.worktrack.core.designsystem.l10n.formatShamsiMonthYear
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.designsystem.l10n.localizedMessage
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendanceDayStatus
import app.worktrack.feature.attendance.R
import java.time.LocalDate
import java.time.LocalTime

@Composable
fun AttendanceHistoryRoute(
    onBack: () -> Unit,
    viewModel: AttendanceHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val submitting by viewModel.submitting.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    // The day whose correction dialog is open, if any.
    var correctionDay by remember { mutableStateOf<AttendanceDay?>(null) }
    val submittedMsg = stringResource(R.string.reg_submitted)

    LaunchedEffect(Unit) {
        viewModel.effects.collect { effect ->
            when (effect) {
                RegularizationEffect.Submitted -> {
                    correctionDay = null
                    snackbarHostState.showSnackbar(submittedMsg)
                }
                is RegularizationEffect.Failed ->
                    snackbarHostState.showSnackbar(effect.error.localizedMessage(context))
            }
        }
    }

    Scaffold(
        topBar = { WtTopBar(title = stringResource(R.string.att_history_title), onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            MonthSelector(
                label = formatShamsiMonthYear(state.shamsiYear, state.shamsiMonth),
                canGoForward = state.canGoForward,
                onPrevious = viewModel::onPreviousMonth,
                onNext = viewModel::onNextMonth,
            )
            if (state.days.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.EventBusy,
                    title = stringResource(R.string.att_history_empty_title),
                    message = stringResource(R.string.att_history_empty_msg),
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.days, key = { it.id }) { day ->
                        DayCard(day = day, onRequestCorrection = { correctionDay = day })
                    }
                }
            }
        }
    }

    correctionDay?.let { day ->
        RegularizationDialog(
            date = day.date,
            submitting = submitting,
            onDismiss = { if (!submitting) correctionDay = null },
            onSubmit = { inTime, outTime, reason ->
                viewModel.submitRegularization(day.date, inTime, outTime, reason)
            },
        )
    }
}

@Composable
private fun MonthSelector(
    label: String,
    canGoForward: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onPrevious) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = stringResource(R.string.att_prev_month),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
        )
        IconButton(onClick = onNext, enabled = canGoForward) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = stringResource(R.string.att_next_month),
            )
        }
    }
}

@Composable
private fun DayCard(day: AttendanceDay, onRequestCorrection: () -> Unit) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Row(
            Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    text = formatShamsiDate(day.date, withWeekday = true),
                    style = MaterialTheme.typography.titleSmall,
                )
                if (day.workedMinutes > 0) {
                    val worked = localizedDigits(
                        stringResource(
                            R.string.att_worked_short,
                            (day.workedMinutes / 60).toString(),
                            (day.workedMinutes % 60).toString(),
                        ),
                    )
                    val overtime = if (day.overtimeMinutes > 0) {
                        " · " + localizedDigits(
                            stringResource(
                                R.string.att_overtime_short,
                                day.overtimeMinutes.toString(),
                            ),
                        )
                    } else {
                        ""
                    }
                    Text(
                        text = worked + overtime,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (day.lateMinutes > 0) {
                    Text(
                        text = localizedDigits(
                            stringResource(R.string.att_late_by, day.lateMinutes.toString()),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            StatusChip(text = day.status.label(), tone = day.status.tone())
            IconButton(onClick = onRequestCorrection) {
                Icon(
                    Icons.Filled.EditCalendar,
                    contentDescription = stringResource(R.string.reg_request),
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

/**
 * Correction request dialog: the employee proposes a corrected clock-in and/or
 * clock-out for [date] plus a reason. Times default to unset; at least one plus
 * a reason is required (enforced here for immediate feedback and server-side).
 */
@Composable
private fun RegularizationDialog(
    date: LocalDate,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (inTime: LocalTime?, outTime: LocalTime?, reason: String) -> Unit,
) {
    var inTime by remember { mutableStateOf<LocalTime?>(null) }
    var outTime by remember { mutableStateOf<LocalTime?>(null) }
    var reason by remember { mutableStateOf("") }
    var picking by remember { mutableStateOf<TimeTarget?>(null) }

    val canSubmit = (inTime != null || outTime != null) && reason.isNotBlank() && !submitting

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.reg_dialog_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = formatShamsiDate(date, withYear = true),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TimeRow(
                    label = stringResource(R.string.reg_in_time),
                    time = inTime,
                    onClick = { picking = TimeTarget.IN },
                )
                TimeRow(
                    label = stringResource(R.string.reg_out_time),
                    time = outTime,
                    onClick = { picking = TimeTarget.OUT },
                )
                Spacer(Modifier.height(4.dp))
                WtTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = stringResource(R.string.reg_reason),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = false,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSubmit,
                onClick = { onSubmit(inTime, outTime, reason) },
            ) { Text(stringResource(R.string.reg_submit)) }
        },
        dismissButton = {
            TextButton(enabled = !submitting, onClick = onDismiss) {
                Text(stringResource(R.string.reg_cancel))
            }
        },
    )

    picking?.let { target ->
        val current = when (target) {
            TimeTarget.IN -> inTime
            TimeTarget.OUT -> outTime
        } ?: LocalTime.of(9, 0)
        TimePickerDialog(
            initial = current,
            onDismiss = { picking = null },
            onConfirm = { picked ->
                when (target) {
                    TimeTarget.IN -> inTime = picked
                    TimeTarget.OUT -> outTime = picked
                }
                picking = null
            },
        )
    }
}

@Composable
private fun TimeRow(label: String, time: LocalTime?, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
        AssistChip(
            onClick = onClick,
            label = {
                Text(
                    time?.let { localizedDigits("%02d:%02d".format(it.hour, it.minute)) }
                        ?: stringResource(R.string.reg_set_time),
                )
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerDialog(
    initial: LocalTime,
    onDismiss: () -> Unit,
    onConfirm: (LocalTime) -> Unit,
) {
    val pickerState = rememberTimePickerState(
        initialHour = initial.hour,
        initialMinute = initial.minute,
        is24Hour = true,
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { onConfirm(LocalTime.of(pickerState.hour, pickerState.minute)) },
            ) { Text(stringResource(app.worktrack.core.designsystem.R.string.ds_ok)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(app.worktrack.core.designsystem.R.string.ds_cancel))
            }
        },
        text = { TimePicker(state = pickerState) },
    )
}

private enum class TimeTarget { IN, OUT }

@Composable
private fun AttendanceDayStatus.label(): String = stringResource(
    when (this) {
        AttendanceDayStatus.PRESENT -> R.string.att_status_present
        AttendanceDayStatus.ABSENT -> R.string.att_status_absent
        AttendanceDayStatus.HALF_DAY -> R.string.att_status_half_day
        AttendanceDayStatus.LEAVE -> R.string.att_status_leave
        AttendanceDayStatus.HOLIDAY -> R.string.att_status_holiday
        AttendanceDayStatus.WEEK_OFF -> R.string.att_status_week_off
        AttendanceDayStatus.PENDING -> R.string.att_status_pending
    },
)

private fun AttendanceDayStatus.tone(): ChipTone = when (this) {
    AttendanceDayStatus.PRESENT -> ChipTone.POSITIVE
    AttendanceDayStatus.ABSENT -> ChipTone.NEGATIVE
    AttendanceDayStatus.HALF_DAY, AttendanceDayStatus.PENDING -> ChipTone.WARNING
    else -> ChipTone.NEUTRAL
}
