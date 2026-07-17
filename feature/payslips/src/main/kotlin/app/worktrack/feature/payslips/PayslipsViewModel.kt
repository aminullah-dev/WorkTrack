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

    val uiState: StateFlow<PayslipsUiState> = year
        .flatMapLatest { selected -> observePayslips(selected) }
        .combine(year) { slips, selected ->
            PayslipsUiState(
                year = selected,
                payslips = slips,
                canGoForward = selected < currentShamsiYear(),
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
        viewModelScope.launch { payslipRepository.refresh(target) }
    }

    private companion object {
        const val KEY_YEAR = "year"
    }
}
