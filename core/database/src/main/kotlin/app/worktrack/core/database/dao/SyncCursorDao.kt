package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.SyncCursorEntity

@Dao
interface SyncCursorDao {

    @Query("SELECT * FROM sync_cursors WHERE resourceType = :resourceType")
    suspend fun cursor(resourceType: String): SyncCursorEntity?

    @Upsert
    suspend fun upsert(cursor: SyncCursorEntity)

    @Query("DELETE FROM sync_cursors")
    suspend fun clear()
}
