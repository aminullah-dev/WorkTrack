package app.worktrack.core.model

import java.time.Instant

enum class AnnouncementPriority { NORMAL, IMPORTANT, URGENT }

data class Announcement(
    val id: String,
    val companyId: String,
    val title: String,
    val body: String,
    val priority: AnnouncementPriority,
    val publishedAt: Instant,
    val expiresAt: Instant?,
    val createdByName: String?,
    val updatedAt: Instant,
)
