package app.worktrack.core.database

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Wipes all local tenant data on sign-out so nothing survives on shared devices.
 *
 * This class exists so that downstream modules (e.g. :core:data) can trigger a
 * full wipe WITHOUT depending on Room: they inject DatabaseCleaner — whose only
 * supertype is Any — instead of WorkTrackDatabase, whose RoomDatabase supertype
 * would otherwise need to be on their compile classpath.
 */
@Singleton
class DatabaseCleaner @Inject constructor(
    private val database: WorkTrackDatabase,
) {
    /** clearAllTables() is blocking/@WorkerThread; run it off the main thread. */
    suspend fun clearAllTenantData() = withContext(Dispatchers.IO) {
        database.clearAllTables()
    }
}
