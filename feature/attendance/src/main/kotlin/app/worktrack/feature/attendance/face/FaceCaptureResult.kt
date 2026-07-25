package app.worktrack.feature.attendance.face

/**
 * Outcome of submitting a captured face embedding. The capture screen shows a
 * different message for each case: "we could not reach the server" and "that is
 * not your face" are very different things to tell someone standing at a gate.
 */
sealed interface FaceCaptureResult {

    /** Accepted. [token] carries the server's signed proof for verifications. */
    data class Success(val token: String? = null) : FaceCaptureResult

    /** The capture did not match the enrolled face (verification only). */
    data object NoMatch : FaceCaptureResult

    /** Nothing to compare against yet — the employee must enroll first. */
    data object NotEnrolled : FaceCaptureResult

    /** Already enrolled; an administrator must reset it before re-enrolling. */
    data object AlreadyEnrolled : FaceCaptureResult

    /** Network or server failure — retrying may well succeed. */
    data object Failed : FaceCaptureResult
}
