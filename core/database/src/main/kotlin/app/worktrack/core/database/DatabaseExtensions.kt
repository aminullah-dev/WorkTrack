package app.worktrack.core.database

/**
 * Wipes every tenant table. Called on sign-out so tenant data never survives on
 * shared devices. Kept here (not in :core:data) so that Room's RoomDatabase
 * supertype — where clearAllTables() is declared — stays encapsulated within
 * this module and is not leaked onto downstream classpaths.
 *
 * clearAllTables() is a blocking, @WorkerThread call; invoke it from a
 * background dispatcher (the repository wraps this in withContext(io)).
 */
fun WorkTrackDatabase.clearAllTenantData() {
    clearAllTables()
}
