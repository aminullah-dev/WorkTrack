package app.worktrack.feature.leave.apply

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.worktrack.core.designsystem.component.SectionHeader
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtTextField
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.core.designsystem.l10n.formatShamsiDate
import app.worktrack.core.designsystem.l10n.localizedDigits
import app.worktrack.core.designsystem.l10n.localizedMessage
import app.worktrack.feature.leave.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun ApplyLeaveRoute(
    onBack: () -> Unit,
    viewModel: ApplyLeaveViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val types by viewModel.types.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ApplyLeaveEffect.Submitted -> onBack()
                is ApplyLeaveEffect.Failed ->
                    snackbarHostState.showSnackbar(effect.error.localizedMessage(context))
            }
        }
    }

    Scaffold(
        topBar = { WtTopBar(title = stringResource(R.string.leave_apply_title), onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        ApplyLeaveScreen(
            state = state,
            typeNames = types.associate { it.id to it.name },
            onTypeSelect = viewModel::onTypeSelect,
            onStartDate = viewModel::onStartDate,
            onEndDate = viewModel::onEndDate,
            onStartHalfDayToggle = viewModel::onStartHalfDayToggle,
            onEndHalfDayToggle = viewModel::onEndHalfDayToggle,
            onReasonChange = viewModel::onReasonChange,
            onSubmit = viewModel::onSubmit,
            modifier = Modifier.padding(padding),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ApplyLeaveScreen(
    state: ApplyLeaveUiState,
    typeNames: Map<String, String>,
    onTypeSelect: (String) -> Unit,
    onStartDate: (LocalDate) -> Unit,
    onEndDate: (LocalDate) -> Unit,
    onStartHalfDayToggle: () -> Unit,
    onEndHalfDayToggle: () -> Unit,
    onReasonChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var datePickerTarget by remember { mutableStateOf<DateTarget?>(null) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp),
    ) {
        SectionHeader(stringResource(R.string.leave_type_section))
        Row(
            Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            typeNames.forEach { (id, name) ->
                FilterChip(
                    selected = state.leaveTypeId == id,
                    onClick = { onTypeSelect(id) },
                    label = { Text(name) },
                )
            }
        }
        if ("leaveTypeId" in state.fieldErrors) FieldError(stringResource(R.string.leave_err_type))

        SectionHeader(stringResource(R.string.leave_dates_section))
        Row(
            Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AssistChip(
                onClick = { datePickerTarget = DateTarget.START },
                label = {
                    Text(
                        state.startDate
                            ?.let { formatShamsiDate(it, withYear = true) }
                            ?: stringResource(R.string.leave_start_date),
                    )
                },
            )
            AssistChip(
                onClick = { datePickerTarget = DateTarget.END },
                label = {
                    Text(
                        state.endDate
                            ?.let { formatShamsiDate(it, withYear = true) }
                            ?: stringResource(R.string.leave_end_date),
                    )
                },
            )
        }
        if ("startDate" in state.fieldErrors) FieldError(stringResource(R.string.leave_err_start))
        if ("endDate" in state.fieldErrors) FieldError(stringResource(R.string.leave_err_end))

        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = state.startHalfDay,
                onClick = onStartHalfDayToggle,
                label = { Text(stringResource(R.string.leave_half_first)) },
            )
            FilterChip(
                selected = state.endHalfDay,
                onClick = onEndHalfDayToggle,
                label = { Text(stringResource(R.string.leave_half_last)) },
            )
        }

        if (state.estimatedDays > 0) {
            Text(
                text = localizedDigits(
                    stringResource(R.string.leave_estimate, "%.1f".format(state.estimatedDays)),
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }

        SectionHeader(stringResource(R.string.leave_reason_section))
        WtTextField(
            value = state.reason,
            onValueChange = onReasonChange,
            label = stringResource(R.string.leave_reason_label),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            errorText = if ("reason" in state.fieldErrors) {
                stringResource(R.string.leave_err_reason)
            } else {
                null
            },
            singleLine = false,
        )

        Spacer(Modifier.height(24.dp))
        WtPrimaryButton(
            text = stringResource(R.string.leave_submit),
            onClick = onSubmit,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            loading = state.isSubmitting,
        )
    }

    datePickerTarget?.let { target ->
        val initial = when (target) {
            DateTarget.START -> state.startDate
            DateTarget.END -> state.endDate
        } ?: LocalDate.now()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { datePickerTarget = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            val date = Instant.ofEpochMilli(millis)
                                .atZone(ZoneOffset.UTC)
                                .toLocalDate()
                            when (target) {
                                DateTarget.START -> onStartDate(date)
                                DateTarget.END -> onEndDate(date)
                            }
                        }
                        datePickerTarget = null
                    },
                ) { Text(stringResource(app.worktrack.core.designsystem.R.string.ds_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { datePickerTarget = null }) {
                    Text(stringResource(app.worktrack.core.designsystem.R.string.ds_cancel))
                }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

private enum class DateTarget { START, END }

@Composable
private fun FieldError(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.padding(horizontal = 16.dp),
    )
}
