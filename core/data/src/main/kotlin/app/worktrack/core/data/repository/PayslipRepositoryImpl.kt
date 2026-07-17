package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.data.mapper.toEntity
import app.worktrack.core.data.mapper.toLineEntities
import app.worktrack.core.data.mapper.toModel
import app.worktrack.core.database.dao.PayslipDao
import app.worktrack.core.datastore.SessionStore
import app.worktrack.core.domain.repository.PayslipRepository
import app.worktrack.core.model.Payslip
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

@Singleton
class PayslipRepositoryImpl @Inject constructor(
    private val payslipDao: PayslipDao,
    private val sessionStore: SessionStore,
    private val api: WorkTrackApi,
) : PayslipRepository {

    override fun observePayslips(periodYear: Int): Flow<List<Payslip>> =
        sessionStore.session.flatMapLatest { session ->
            if (session == null) {
                flowOf(emptyList())
            } else {
                payslipDao.observePayslips(session.employeeId, periodYear)
                    .map { slips -> slips.map { it.toModel() } }
            }
        }

    override fun observePayslip(payslipId: String): Flow<Payslip?> =
        payslipDao.observePayslip(payslipId).map { it?.toModel() }

    override suspend fun refresh(periodYear: Int): AppResult<Unit> =
        apiCall { api.payslips(periodYear) }
            .map { envelope ->
                envelope.data.forEach { dto ->
                    payslipDao.replacePayslip(dto.toEntity(), dto.toLineEntities())
                }
            }
}
