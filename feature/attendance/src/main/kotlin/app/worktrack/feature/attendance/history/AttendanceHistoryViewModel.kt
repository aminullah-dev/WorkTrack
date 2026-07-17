package app.worktrack.feature.attendance.history

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.time.SolarHijri
import app.worktrack.core.common.time.SolarHijriDate
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.model.AttendanceDay
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * Attendance history paged by **Solar Hijri** months — the business calendar
 * of the platform. The Room query range is the Gregorian projection of the
 * selected Shamsi month.
 */
data class AttendanceHistoryUiState(
    val shamsiYear: Int,
    val shamsiMonth: Int,
    val days: List<AttendanceDay>,
    val canGoForward: Boolean,
)

@HiltViewModel
class AttendanceHistoryViewModel @Inject constructor(
    attendanceRepository: AttendanceRepository,
    private val timeProvider: TimeProvider,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private fun currentShamsiMonth(): SolarHijriDate = SolarHijri.today(timeProvider)

    // "1405-04" — survives process death.
    private val monthKey: StateFlow<String> = savedStateHandle.getStateFlow(
        KEY_MONTH,
        currentShamsiMonth().monthKey(),
    )

    val uiState: StateFlow<AttendanceHistoryUiState> = monthKey
        .map(::parseKey)
        .flatMapLatest { (year, month) ->
            attendanceRepository
                .observeDays(
                    from = SolarHijri.monthStart(year, month),
                    to = SolarHijri.monthEnd(year, month),
                )
                .map { days ->
                    val today = currentShamsiMonth()
                    AttendanceHistoryUiState(
                        shamsiYear = year,
                        shamsiMonth = month,
                        days = days,
                        canGoForward = year < today.year ||
                            (year == today.year && month < today.month),
                    )
                }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = parseKey(monthKey.value).let { (year, month) ->
                AttendanceHistoryUiState(year, month, emptyList(), canGoForward = false)
            },
        )

    fun onPreviousMonth() = shiftMonth(-1)

    fun onNextMonth() = shiftMonth(+1)

    private fun shiftMonth(delta: Int) {
        val (year, month) = parseKey(monthKey.value)
        var targetYear = year
        var targetMonth = month + delta
        if (targetMonth < 1) {
            targetMonth = 12
            targetYear -= 1
        } else if (targetMonth > 12) {
            targetMonth = 1
            targetYear += 1
        }
        val today = currentShamsiMonth()
        val beyondCurrent = targetYear > today.year ||
            (targetYear == today.year && targetMonth > today.month)
        if (beyondCurrent) return
        savedStateHandle[KEY_MONTH] = SolarHijriDate(targetYear, targetMonth, 1).monthKey()
    }

    private fun parseKey(key: String): Pair<Int, Int> {
        val (year, month) = key.split("-").map(String::toInt)
        return year to month
    }

    private companion object {
        const val KEY_MONTH = "shamsiMonth"
    }
}
