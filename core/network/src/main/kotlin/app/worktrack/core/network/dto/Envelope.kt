package app.worktrack.core.network.dto

import kotlinx.serialization.Serializable

/** Standard success envelope: { "data": ..., "meta": { "cursor": ... } }. */
@Serializable
data class ApiEnvelope<T>(
    val data: T,
    val meta: ApiMeta? = null,
)

@Serializable
data class ApiMeta(
    val cursor: String? = null,
    val hasMore: Boolean = false,
)

/** RFC 7807 problem+json error body produced by the API. */
@Serializable
data class ProblemDto(
    val type: String? = null,
    val title: String? = null,
    val status: Int? = null,
    val code: String? = null,
    val detail: String? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
)
