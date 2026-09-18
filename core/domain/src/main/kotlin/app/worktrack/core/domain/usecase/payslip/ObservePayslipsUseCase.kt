package app.worktrack.core.domain.usecase.payslip

import app.worktrack.core.domain.repository.PayslipRepository
import app.worktrack.core.model.Payslip
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObservePayslipsUseCase @Inject constructor(
    private val payslipRepository: PayslipRepository,
) {
    operator fun invoke(periodYear: Int): Flow<List<Payslip>> =
        payslipRepository.observePayslips(periodYear)
}
