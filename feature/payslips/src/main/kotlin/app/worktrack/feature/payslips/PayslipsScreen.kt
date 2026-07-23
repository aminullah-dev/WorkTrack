package app.worktrack.feature.payslips

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.l10n.formatShamsiMonthYear
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.model.Payslip

@Composable
fun PayslipsRoute(
    onPayslipClick: (String) -> Unit,
    viewModel: PayslipsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = viewModel::onPreviousYear) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = stringResource(R.string.pay_prev_year),
                )
            }
            Text(
                text = localizedDigits(state.year.toString()),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            IconButton(onClick = viewModel::onNextYear, enabled = state.canGoForward) {
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = stringResource(R.string.pay_next_year),
                )
            }
        }

        if (state.payslips.isEmpty()) {
            EmptyState(
                icon = Icons.AutoMirrored.Filled.ReceiptLong,
                title = stringResource(
                    R.string.pay_no_payslips_title,
                    localizedDigits(state.year.toString()),
                ),
                message = stringResource(R.string.pay_no_payslips_msg),
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.payslips, key = { it.id }) { payslip ->
                    PayslipCard(payslip = payslip, onClick = { onPayslipClick(payslip.id) })
                }
            }
        }
    }
}

@Composable
private fun PayslipCard(payslip: Payslip, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    // Payroll periods are Solar Hijri months (e.g. "سرطان ۱۴۰۵").
                    text = formatShamsiMonthYear(payslip.periodYear, payslip.periodMonth),
                    style = MaterialTheme.typography.titleSmall,
                )
                val worked = localizedDigits(
                    stringResource(R.string.pay_worked_days, "%.1f".format(payslip.workedDays)),
                )
                val lop = if (payslip.lopDays > 0) {
                    " · " + localizedDigits(
                        stringResource(R.string.pay_lop_days, "%.1f".format(payslip.lopDays)),
                    )
                } else {
                    ""
                }
                Text(
                    text = worked + lop,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = localizedDigits("${payslip.currency} ${"%,.2f".format(payslip.net)}"),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
