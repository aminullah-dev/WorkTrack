package app.worktrack.core.network.dto

import kotlinx.serialization.Serializable

/** On-device face embedding sent for enrollment or verification (never a photo). */
@Serializable
data class FaceEmbeddingDto(
    val embedding: List<Float>,
)

@Serializable
data class FaceEnrollResultDto(
    val faceEnrolled: Boolean = true,
)

@Serializable
data class FaceVerifyResultDto(
    val match: Boolean,
    val similarity: Float,
    val threshold: Float,
    val enrolled: Boolean,
    /** Signed proof of the match; presented with the punch. Null when no match. */
    val token: String? = null,
)
