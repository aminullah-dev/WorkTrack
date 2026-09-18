package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import app.worktrack.core.network.serializer.LocalDateSerializer
import java.time.Instant
import java.time.LocalDate
import kotlinx.serialization.Serializable

/** Client -> server attendance-correction payload (also the outbox payload). */
@Serializable
data class RegularizationCreateDto(
    val id: String, // client-generated ULID
    @Serializable(LocalDateSerializer::class) val date: LocalDate,
    @Serializable(InstantSerializer::class) val requestedInAt: Instant? = null,
    @Serializable(InstantSerializer::class) val requestedOutAt: Instant? = null,
    val reason: String,
)
