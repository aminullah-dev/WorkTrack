package app.worktrack.core.common.result

/**
 * Canonical error taxonomy for the whole app. Layers map their native failures
 * (IOException, HTTP problem+json, Firestore errors) into one of these so that
 * UI and domain logic never depend on transport-specific exception types.
 */
sealed interface AppError {

    /** No connectivity, DNS failure, timeout — safe to retry when back online. */
    data object Network : AppError

    /** Missing/expired credentials; the session must be re-established. */
    data object Unauthenticated : AppError

    /** Authenticated but not allowed (RBAC denial, tenant mismatch). */
    data object PermissionDenied : AppError

    data object NotFound : AppError

    /** Client-side or server-side input validation failure. */
    data class Validation(
        val message: String,
        val fieldErrors: Map<String, String> = emptyMap(),
    ) : AppError

    /**
     * A domain rule rejected the operation (e.g. GEOFENCE_VIOLATION,
     * INSUFFICIENT_LEAVE_BALANCE). [code] matches the API error catalog.
     */
    data class Business(val code: String, val message: String) : AppError

    /** Non-2xx HTTP response that does not map to a more specific error. */
    data class Http(val status: Int, val code: String? = null, val message: String? = null) : AppError

    /** Programming errors and anything unforeseen; always logged, never swallowed. */
    data class Unexpected(val cause: Throwable? = null) : AppError
}

/** True when retrying the same operation later can plausibly succeed. */
val AppError.isRetryable: Boolean
    get() = when (this) {
        AppError.Network -> true
        is AppError.Http -> status in 500..599 || status == 429
        else -> false
    }
