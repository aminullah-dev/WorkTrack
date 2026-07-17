package app.worktrack.feature.attendance.history

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.usecase.attendance.ObserveAttendanceHistoryUseCase
import app.worktrack.core.model.AttendanceDay
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.YearMonth
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class AttendanceHistoryUiState(
    val month: YearMonth,
    val days: List<AttendanceDay>,
    val canGoForward: Boolean,
)

@HiltViewModel
class AttendanceHistoryViewModel @Inject constructor(
    observeHistory: ObserveAttendanceHistoryUseCase,
    private val timeProvider: TimeProvider,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    // Persist the selected month across process death (survives low-memory kills).
    private val month: StateFlow<String> = savedStateHandle.getStateFlow(
        KEY_MONTH,
        YearMonth.from(timeProvider.today()).toString(),
    )

    val uiState: StateFlow<AttendanceHistoryUiState> = month
        .map(YearMonth::parse)
        .flatMapLatest { selected ->
            observeHistory(selected).map { days -> selected to days }
        }
        .combine(month) { (selected, days), _ ->
            AttendanceHistoryUiState(
                month = selected,
                days = days,
                canGoForward = selected < YearMonth.from(timeProvider.today()),
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = AttendanceHistoryUiState(
                month = YearMonth.parse(month.value),
                days = emptyList(),
                canGoForward = false,
            ),
        )

    fun onPreviousMonth() = shiftMonth(-1)

    fun onNextMonth() = shiftMonth(+1)

    private fun shiftMonth(delta: Long) {
        val current = YearMonth.parse(month.value)
        val target = current.plusMonths(delta)
        if (target > YearMonth.from(timeProvider.today())) return
        savedStateHandle[KEY_MONTH] = target.toString()
    }

    private companion object {
        const val KEY_MONTH = "month"
    }
}
