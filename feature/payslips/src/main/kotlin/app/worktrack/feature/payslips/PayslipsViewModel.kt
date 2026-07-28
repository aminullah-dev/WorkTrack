package app.worktrack.feature.payslips

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.time.SolarHijri
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.PayslipRepository
import app.worktrack.core.domain.usecase.payslip.ObservePayslipsUseCase
import app.worktrack.core.model.Payslip
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Payroll periods are **Solar Hijri** months/years for Afghan tenants:
 * periodYear/periodMonth on payslips carry Shamsi values (e.g. 1405/4 = Saratan).
 */
data class PayslipsUiState(
    val year: Int,
    val payslips: List<Payslip> = emptyList(),
    val canGoForward: Boolean = false,
    /** Selected Shamsi month (1–12), or null for the whole year. */
    val month: Int? = null,
    /** Months of [year] that have a payslip, so the picker can dim the rest. */
    val monthsWithPayslips: Set<Int> = emptySet(),
)

@HiltViewModel
class PayslipsViewModel @Inject constructor(
    observePayslips: ObservePayslipsUseCase,
    private val payslipRepository: PayslipRepository,
    private val timeProvider: TimeProvider,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private fun currentShamsiYear(): Int = SolarHijri.today(timeProvider).year

    private val year: StateFlow<Int> =
        savedStateHandle.getStateFlow(KEY_YEAR, currentShamsiYear())

    /** 0 means "the whole year"; SavedStateHandle keeps no nullable Int. */
    private val month: StateFlow<Int> =
        savedStateHandle.getStateFlow(KEY_MONTH, ALL_MONTHS)

    val uiState: StateFlow<PayslipsUiState> = year
        .flatMapLatest { selected -> observePayslips(selected) }
        .combine(year) { slips, selected -> slips to selected }
        .combine(month) { (slips, selected), selectedMonth ->
            PayslipsUiState(
                year = selected,
                // Filtering here rather than in the query keeps the month picker
                // able to show which months exist without a second read.
                payslips = slips.filter {
                    selectedMonth == ALL_MONTHS || it.periodMonth == selectedMonth
                },
                canGoForward = selected < currentShamsiYear(),
                month = selectedMonth.takeIf { it != ALL_MONTHS },
                monthsWithPayslips = slips.map { it.periodMonth }.toSet(),
            )
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = PayslipsUiState(year = year.value),
        )

    init {
        // Historic years are outside the delta-sync hot window; fetch on open.
        viewModelScope.launch { payslipRepository.refresh(year.value) }
    }

    fun onPreviousYear() = shiftYear(-1)

    fun onNextYear() = shiftYear(+1)

    private fun shiftYear(delta: Int) {
        val target = year.value + delta
        if (target > currentShamsiYear()) return
        savedStateHandle[KEY_YEAR] = target
        // Changing year keeps whichever month is selected, so stepping back a
        // year lands on the same month rather than resetting to the full list.
        viewModelScope.launch { payslipRepository.refresh(target) }
    }

    /** Null selects the whole year. */
    fun onMonthSelected(month: Int?) {
        savedStateHandle[KEY_MONTH] = month ?: ALL_MONTHS
    }

    private companion object {
        const val KEY_YEAR = "year"
        const val KEY_MONTH = "month"
        const val ALL_MONTHS = 0
    }
}
