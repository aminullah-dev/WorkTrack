package app.worktrack.feature.leave

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import app.worktrack.core.model.LeaveType

/** Only the untouched Dari names signup seeds are translated; a company's own name stays as typed. */
internal fun builtInNameRes(type: LeaveType): Int? = when {
    type.code == "ANNUAL" && type.name == "رخصتی سالانه" -> R.string.leave_type_annual
    type.code == "SICK" && type.name == "رخصتی مریضی" -> R.string.leave_type_sick
    else -> null
}

@Composable
internal fun LeaveType.displayName(): String = builtInNameRes(this)?.let { stringResource(it) } ?: name
