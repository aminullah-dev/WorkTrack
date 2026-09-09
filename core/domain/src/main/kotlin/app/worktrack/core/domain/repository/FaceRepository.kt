package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult

/** On-device face enrollment and verification (only embeddings, never photos). */
interface FaceRepository {

    /** Enroll the current user's face embedding. */
    suspend fun enroll(embedding: List<Float>): AppResult<Unit>

    /** Verify a check-in embedding against the enrolled one. */
    suspend fun verify(embedding: List<Float>): AppResult<FaceVerification>
}

data class FaceVerification(
    val match: Boolean,
    val similarity: Float,
    val enrolled: Boolean,
    /**
     * Server-signed proof of the match, sent with the punch so the server can
     * trust it. Null unless [match] is true; short-lived.
     */
    val token: String? = null,
)
