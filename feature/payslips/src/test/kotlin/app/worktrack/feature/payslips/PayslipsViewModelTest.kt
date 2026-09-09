package app.worktrack.feature.payslips

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.ReceiveTurbine
import app.cash.turbine.test
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.domain.repository.PayslipRepository
import app.worktrack.core.domain.usecase.payslip.ObservePayslipsUseCase
import app.worktrack.core.model.Payslip
import app.worktrack.core.model.PayslipStatus
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * The month filter cannot be seen on a tenant with no payroll history, and
 * running payroll to produce one is a financial operation — so the filtering
 * itself is covered here.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PayslipsViewModelTest {

    private val repository = mockk<PayslipRepository>(relaxed = true)
    private val timeProvider = object : TimeProvider {
        // 2026-07-27 → 1405/05 (Asad) in the Solar Hijri calendar.
        override fun now(): Instant = Instant.parse("2026-07-27T09:00:00Z")
        override fun zone(): ZoneId = ZoneId.of("Asia/Kabul")
    }

    @Before
    fun setUp() = Dispatchers.setMain(StandardTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun payslip(month: Int) = Payslip(
        id = "p$month",
        companyId = "c1",
        runId = "1405_$month",
        employeeId = "e1",
        periodYear = 1405,
        periodMonth = month,
        currency = "AFN",
        gross = 30000.0,
        totalDeductions = 1000.0,
        net = 29000.0,
        workedDays = 26.0,
        paidLeaveDays = 0.0,
        lopDays = 0.0,
        overtimeMinutes = 0,
        status = PayslipStatus.PAID,
        pdfUrl = null,
        lines = emptyList(),
        updatedAt = Instant.parse("2026-07-01T00:00:00Z"),
    )

    private fun viewModel(months: List<Int>): PayslipsViewModel {
        every { repository.observePayslips(any()) } returns flowOf(months.map(::payslip))
        coEvery { repository.refresh(any()) } returns AppResult.Success(Unit)
        return PayslipsViewModel(
            observePayslips = ObservePayslipsUseCase(repository),
            payslipRepository = repository,
            timeProvider = timeProvider,
            savedStateHandle = SavedStateHandle(),
        )
    }

    /** stateIn emits a placeholder before the repository flow arrives. */
    private suspend fun ReceiveTurbine<PayslipsUiState>.awaitLoaded(): PayslipsUiState {
        var state = awaitItem()
        while (state.monthsWithPayslips.isEmpty()) state = awaitItem()
        return state
    }

    @Test
    fun `shows every month of the year until one is picked`() = runTest {
        viewModel(listOf(1, 2, 4)).uiState.test {
            val state = awaitLoaded()
            assertNull(state.month)
            assertEquals(3, state.payslips.size)
        }
    }

    @Test
    fun `narrows the list to the selected month`() = runTest {
        val vm = viewModel(listOf(1, 2, 4))
        vm.uiState.test {
            awaitLoaded()
            vm.onMonthSelected(2)
            val state = awaitItem()
            assertEquals(2, state.month)
            assertEquals(listOf(2), state.payslips.map { it.periodMonth })
        }
    }

    @Test
    fun `reports which months have a payslip so the picker can dim the rest`() = runTest {
        val vm = viewModel(listOf(1, 2, 4))
        vm.uiState.test {
            assertEquals(setOf(1, 2, 4), awaitLoaded().monthsWithPayslips)

            // Narrowing must not shrink the picker to just the chosen month.
            vm.onMonthSelected(2)
            assertEquals(setOf(1, 2, 4), awaitItem().monthsWithPayslips)
        }
    }

    @Test
    fun `selecting a month with no payslip empties the list, not the picker`() = runTest {
        val vm = viewModel(listOf(1, 2, 4))
        vm.uiState.test {
            awaitLoaded()
            vm.onMonthSelected(7)
            val state = awaitItem()
            assertEquals(emptyList<Payslip>(), state.payslips)
            assertEquals(setOf(1, 2, 4), state.monthsWithPayslips)
        }
    }

    @Test
    fun `clearing the filter restores the whole year`() = runTest {
        val vm = viewModel(listOf(1, 2, 4))
        vm.uiState.test {
            awaitLoaded()
            vm.onMonthSelected(2)
            awaitItem()
            vm.onMonthSelected(null)
            val state = awaitItem()
            assertNull(state.month)
            assertEquals(3, state.payslips.size)
        }
    }
}
