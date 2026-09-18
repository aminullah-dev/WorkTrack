package app.worktrack.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A stable identifier for this installation, used to claim a licence seat.
 *
 * Generated once and kept for the life of the install. It is deliberately NOT
 * derived from hardware identifiers: ANDROID_ID and friends need permissions,
 * change under work profiles, and are personal data we have no reason to hold.
 * A random id tied to the app's own storage is enough to count devices, which
 * is all the licence needs.
 *
 * Clearing the app's data yields a new id and therefore a new seat, so an
 * administrator can revoke the stale one from the portal.
 */
@Singleton
class DeviceIdStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private val key = stringPreferencesKey("device_id")

    // Two callers racing on first launch must not mint two different ids.
    private val mutex = Mutex()

    @Volatile
    private var cached: String? = null

    suspend fun deviceId(): String {
        cached?.let { return it }
        return mutex.withLock {
            cached?.let { return it }
            val existing = dataStore.data.first()[key]
            val id = existing ?: newId().also { fresh ->
                dataStore.edit { it[key] = fresh }
            }
            cached = id
            id
        }
    }

    /** Matches the server's accepted shape: A–Z, 0–9, underscore and dash. */
    private fun newId(): String = "and-" + UUID.randomUUID().toString().replace("-", "")
}
