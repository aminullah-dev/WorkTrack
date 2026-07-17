package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.Payslip
import kotlinx.coroutines.flow.Flow

interface PayslipRepository {

    fun observePayslips(periodYear: Int): Flow<List<Payslip>>

    fun observePayslip(payslipId: String): Flow<Payslip?>

    suspend fun refresh(periodYear: Int): AppResult<Unit>
}
