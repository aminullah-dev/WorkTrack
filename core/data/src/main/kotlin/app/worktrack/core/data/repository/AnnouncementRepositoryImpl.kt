package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.data.mapper.toEntity
import app.worktrack.core.data.mapper.toModel
import app.worktrack.core.database.dao.AnnouncementDao
import app.worktrack.core.domain.repository.AnnouncementRepository
import app.worktrack.core.model.Announcement
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

@Singleton
class AnnouncementRepositoryImpl @Inject constructor(
    private val announcementDao: AnnouncementDao,
    private val api: WorkTrackApi,
    private val timeProvider: TimeProvider,
) : AnnouncementRepository {

    override fun observeAnnouncements(): Flow<List<Announcement>> =
        // 'now' is captured per collection so returning to the screen re-filters
        // expired announcements without needing a DB write.
        flow {
            emitAll(announcementDao.observeActive(timeProvider.now()))
        }.map { items -> items.map { it.toModel() } }

    override suspend fun refresh(): AppResult<Unit> =
        apiCall { api.announcements() }
            .map { envelope ->
                announcementDao.upsertAnnouncements(envelope.data.map { it.toEntity() })
            }
}
