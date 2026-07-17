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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.ChipTone
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.StatusChip
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendanceDayStatus
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun AttendanceHistoryRoute(
    onBack: () -> Unit,
    viewModel: AttendanceHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = { WtTopBar(title = "Attendance history", onBack = onBack) },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            MonthSelector(
                label = "${
                    state.month.month.getDisplayName(TextStyle.FULL, Locale.getDefault())
                } ${state.month.year}",
                canGoForward = state.canGoForward,
                onPrevious = viewModel::onPreviousMonth,
                onNext = viewModel::onNextMonth,
            )
            if (state.days.isEmpty()) {
                EmptyState(
                    icon = Icons.Filled.EventBusy,
                    title = "No records",
                    message = "Attendance for this month appears here after your first sync.",
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
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous month")
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        IconButton(onClick = onNext, enabled = canGoForward) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next month")
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
                    text = day.date.format(DateTimeFormatter.ofPattern("EEE, d MMM")),
                    style = MaterialTheme.typography.titleSmall,
                )
                if (day.workedMinutes > 0) {
                    Text(
                        text = "Worked ${day.workedMinutes / 60}h ${day.workedMinutes % 60}m" +
                            if (day.overtimeMinutes > 0) " · OT ${day.overtimeMinutes}m" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (day.lateMinutes > 0) {
                    Text(
                        text = "Late by ${day.lateMinutes}m",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            StatusChip(text = day.status.label(), tone = day.status.tone())
        }
    }
}

private fun AttendanceDayStatus.label(): String = when (this) {
    AttendanceDayStatus.PRESENT -> "Present"
    AttendanceDayStatus.ABSENT -> "Absent"
    AttendanceDayStatus.HALF_DAY -> "Half day"
    AttendanceDayStatus.LEAVE -> "Leave"
    AttendanceDayStatus.HOLIDAY -> "Holiday"
    AttendanceDayStatus.WEEK_OFF -> "Week off"
    AttendanceDayStatus.PENDING -> "Pending"
}

private fun AttendanceDayStatus.tone(): ChipTone = when (this) {
    AttendanceDayStatus.PRESENT -> ChipTone.POSITIVE
    AttendanceDayStatus.ABSENT -> ChipTone.NEGATIVE
    AttendanceDayStatus.HALF_DAY, AttendanceDayStatus.PENDING -> ChipTone.WARNING
    else -> ChipTone.NEUTRAL
}
