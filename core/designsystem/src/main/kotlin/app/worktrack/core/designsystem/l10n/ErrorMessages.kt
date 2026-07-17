package app.worktrack.core.designsystem.l10n

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import app.worktrack.core.common.result.AppError
import app.worktrack.core.designsystem.R

/**
 * Localized, user-facing message for any [AppError]. Business errors map by
 * their stable code; unknown codes fall back to the server-provided detail
 * (already human-readable) and finally to the generic message.
 */
fun AppError.localizedMessage(context: Context): String = when (this) {
    AppError.Network -> context.getString(R.string.ds_err_network)
    AppError.Unauthenticated -> context.getString(R.string.ds_err_unauthenticated)
    AppError.PermissionDenied -> context.getString(R.string.ds_err_permission)
    AppError.NotFound -> context.getString(R.string.ds_err_not_found)
    is AppError.Validation -> context.getString(R.string.ds_err_validation)
    is AppError.Business -> when (code) {
        "INVALID_CREDENTIALS" -> context.getString(R.string.ds_err_invalid_credentials)
        "MOCK_LOCATION" -> context.getString(R.string.ds_err_mock_location)
        "GEOFENCE_VIOLATION" -> context.getString(R.string.ds_err_geofence)
        "INSUFFICIENT_LEAVE_BALANCE" -> context.getString(R.string.ds_err_leave_balance)
        "NOT_SYNCED" -> context.getString(R.string.ds_err_not_synced)
        "KIOSK_TOKEN_INVALID" -> context.getString(R.string.ds_err_kiosk_token)
        "INVALID_STATE" -> context.getString(R.string.ds_err_invalid_state)
        else -> message.ifBlank { context.getString(R.string.ds_err_unexpected) }
    }

    is AppError.Http -> context.getString(R.string.ds_err_server, status.toString())
    is AppError.Unexpected -> context.getString(R.string.ds_err_unexpected)
}

@Composable
fun AppError.localizedMessage(): String = localizedMessage(LocalContext.current)
