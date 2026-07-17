package app.worktrack.feature.payslips.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.domain.usecase.payslip.ObservePayslipDetailUseCase
import app.worktrack.core.model.Payslip
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

@HiltViewModel
class PayslipDetailViewModel @Inject constructor(
    observePayslipDetail: ObservePayslipDetailUseCase,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val payslipId: String = checkNotNull(savedStateHandle[ARG_PAYSLIP_ID]) {
        "payslipId navigation argument is required"
    }

    val payslip: StateFlow<Payslip?> = observePayslipDetail(payslipId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    companion object {
        const val ARG_PAYSLIP_ID = "payslipId"
    }
}
