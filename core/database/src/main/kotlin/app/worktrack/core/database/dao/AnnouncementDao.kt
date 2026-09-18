package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.AnnouncementEntity
import java.time.Instant
import kotlinx.coroutines.flow.Flow

@Dao
interface AnnouncementDao {

    @Upsert
    suspend fun upsertAnnouncements(announcements: List<AnnouncementEntity>)

    @Query(
        """
        SELECT * FROM announcements
        WHERE publishedAt <= :now AND (expiresAt IS NULL OR expiresAt > :now)
        ORDER BY publishedAt DESC
        LIMIT 100
        """,
    )
    fun observeActive(now: Instant): Flow<List<AnnouncementEntity>>

    @Query("DELETE FROM announcements")
    suspend fun clearAnnouncements()
}
