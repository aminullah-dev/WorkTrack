package app.worktrack.core.common.result

/**
 * Default English user-facing message per error. Feature UIs may override for
 * screen-specific phrasing; localization replaces this in the l10n pass (P1).
 */
fun AppError.userMessage(): String = when (this) {
    AppError.Network -> "You're offline. Changes are saved and will sync automatically."
    AppError.Unauthenticated -> "Your session has expired. Please sign in again."
    AppError.PermissionDenied -> "You don't have permission to do that."
    AppError.NotFound -> "That item could not be found."
    is AppError.Validation -> message
    is AppError.Business -> message
    is AppError.Http -> message ?: "Something went wrong on the server ($status)."
    is AppError.Unexpected -> "Something went wrong. Please try again."
}
