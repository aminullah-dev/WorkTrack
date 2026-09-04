package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.Announcement
import kotlinx.coroutines.flow.Flow

interface AnnouncementRepository {

    /** Currently visible announcements (published, not expired), newest first. */
    fun observeAnnouncements(): Flow<List<Announcement>>

    suspend fun refresh(): AppResult<Unit>
}
