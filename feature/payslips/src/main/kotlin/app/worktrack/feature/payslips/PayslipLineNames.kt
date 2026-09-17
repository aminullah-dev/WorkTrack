package app.worktrack.feature.payslips

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.worktrack.core.model.PayslipLine

/** Payroll names these three lines in Dari itself; company components keep their own names. */
internal fun builtInNameRes(line: PayslipLine): Int? = when (line.componentCode) {
    "BASIC" -> R.string.pay_basic
    "LOP" -> R.string.pay_absence
    "TAX" -> R.string.pay_income_tax
    else -> null
}

@Composable
internal fun PayslipLine.displayName(): String = builtInNameRes(this)?.let { stringResource(it) } ?: componentName
