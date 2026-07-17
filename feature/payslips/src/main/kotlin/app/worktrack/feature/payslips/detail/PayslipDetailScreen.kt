package app.worktrack.feature.payslips.detail

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.FullScreenLoading
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.model.PayComponentType
import app.worktrack.core.model.Payslip
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

@Composable
fun PayslipDetailRoute(
    onBack: () -> Unit,
    viewModel: PayslipDetailViewModel = hiltViewModel(),
) {
    val payslip by viewModel.payslip.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            WtTopBar(
                title = payslip?.let {
                    "${Month.of(it.periodMonth).getDisplayName(TextStyle.SHORT, Locale.getDefault())} ${it.periodYear}"
                } ?: "Payslip",
                onBack = onBack,
            )
        },
    ) { padding ->
        when (val slip = payslip) {
            null -> FullScreenLoading(Modifier.padding(padding))
            else -> PayslipDetail(payslip = slip, modifier = Modifier.padding(padding))
        }
    }
}

@Composable
private fun PayslipDetail(payslip: Payslip, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
            ),
        ) {
            Column(Modifier.padding(16.dp)) {
                Text("Net pay", style = MaterialTheme.typography.labelMedium)
                Text(
                    text = "${payslip.currency} ${"%,.2f".format(payslip.net)}",
                    style = MaterialTheme.typography.headlineMedium,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Gross ${"%,.2f".format(payslip.gross)} − " +
                        "Deductions ${"%,.2f".format(payslip.totalDeductions)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        val earnings = payslip.lines.filter { it.type == PayComponentType.EARNING }
        val deductions = payslip.lines.filter { it.type == PayComponentType.DEDUCTION }

        if (earnings.isNotEmpty()) {
            SectionHeader("Earnings")
            LinesCard(lines = earnings.map { it.componentName to it.amount }, currency = payslip.currency)
        }
        if (deductions.isNotEmpty()) {
            SectionHeader("Deductions")
            LinesCard(lines = deductions.map { it.componentName to it.amount }, currency = payslip.currency)
        }

        SectionHeader("Attendance summary")
        LinesCard(
            lines = listOf(
                "Worked days" to payslip.workedDays,
                "Paid leave days" to payslip.paidLeaveDays,
                "Loss of pay days" to payslip.lopDays,
            ),
            currency = null,
        )
    }
}

@Composable
private fun LinesCard(lines: List<Pair<String, Double>>, currency: String?) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        Column(Modifier.padding(12.dp)) {
            lines.forEachIndexed { index, (name, amount) ->
                if (index > 0) HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Row {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = if (currency != null) {
                            "$currency ${"%,.2f".format(amount)}"
                        } else {
                            "%.1f".format(amount)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
