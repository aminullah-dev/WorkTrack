package app.worktrack.feature.attendance.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.designsystem.l10n.formatShamsiDate
import app.worktrack.core.designsystem.l10n.formatShamsiMonthYear
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendanceDayStatus
import app.worktrack.feature.attendance.R

@Composable
fun AttendanceHistoryRoute(
    onBack: () -> Unit,
    viewModel: AttendanceHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { WtTopBar(title = stringResource(R.string.att_history_title), onBack = onBack) },
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
                    items(state.days, key = { it.id }) { day -> DayCard(day) }
                }
            }
        }
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
private fun DayCard(day: AttendanceDay) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Row(
            Modifier.padding(12.dp),
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
        }
    }
}

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
