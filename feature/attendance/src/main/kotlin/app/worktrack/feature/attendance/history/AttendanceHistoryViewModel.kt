package app.worktrack.feature.attendance.history

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.time.SolarHijri
import app.worktrack.core.common.time.SolarHijriDate
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.domain.usecase.attendance.RequestRegularizationUseCase
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.RegularizationCommand
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.LocalTime
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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

/** One-shot outcomes of filing an attendance correction, surfaced as a snackbar. */
sealed interface RegularizationEffect {
    data object Submitted : RegularizationEffect
    data class Failed(val error: AppError) : RegularizationEffect
}

@HiltViewModel
class AttendanceHistoryViewModel @Inject constructor(
    attendanceRepository: AttendanceRepository,
    private val requestRegularization: RequestRegularizationUseCase,
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

    private val _effects = Channel<RegularizationEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private val _submitting = MutableStateFlow(false)
    val submitting: StateFlow<Boolean> = _submitting.asStateFlow()

    /**
     * Files a correction for [date]. Times are the employee's local wall-clock
     * for that day, anchored to the company time zone before being sent as UTC
     * instants — so 8:30 always means 8:30 in Kabul regardless of device zone.
     */
    fun submitRegularization(
        date: LocalDate,
        inTime: LocalTime?,
        outTime: LocalTime?,
        reason: String,
    ) {
        if (_submitting.value) return
        _submitting.update { true }
        viewModelScope.launch {
            val zone = timeProvider.zone()
            val command = RegularizationCommand(
                date = date,
                requestedInAt = inTime?.let { date.atTime(it).atZone(zone).toInstant() },
                requestedOutAt = outTime?.let { date.atTime(it).atZone(zone).toInstant() },
                reason = reason,
            )
            val effect = when (val result = requestRegularization(command)) {
                is AppResult.Success -> RegularizationEffect.Submitted
                is AppResult.Failure -> RegularizationEffect.Failed(result.error)
            }
            _effects.send(effect)
            _submitting.update { false }
        }
    }

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
