package app.worktrack.core.datastore

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.worktrack.core.model.CompanyFeatures
import app.worktrack.core.model.RoleCode
import app.worktrack.core.model.UserSession
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persists the resolved user session (identity + tenant + roles) across process
 * restarts so the app opens straight into offline mode. Auth *tokens* are never
 * stored here — the Firebase SDK owns credential storage and refresh.
 */
@Singleton
class SessionStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {

    @Serializable
    private data class StoredSession(
        val uid: String,
        val companyId: String,
        val employeeId: String,
        val displayName: String,
        val email: String,
        val avatarUrl: String?,
        val roles: List<String>,
        val branchIds: List<String>,
        val companyName: String,
        val features: StoredFeatures = StoredFeatures(),
    )

    @Serializable
    private data class StoredFeatures(
        val shifts: Boolean = true,
        val leave: Boolean = true,
        val payroll: Boolean = true,
        val regularization: Boolean = true,
        val announcements: Boolean = true,
        val geofencing: Boolean = true,
        val qrKiosk: Boolean = true,
        val faceRecognition: Boolean = true,
    )

    private val json = Json { ignoreUnknownKeys = true }

    val session: Flow<UserSession?> = dataStore.data.map { prefs ->
        prefs[KEY_SESSION]?.let { raw ->
            try {
                json.decodeFromString<StoredSession>(raw).toModel()
            } catch (_: SerializationException) {
                null // Corrupt/legacy payload: treat as signed out rather than crash.
            }
        }
    }

    suspend fun save(session: UserSession) {
        dataStore.edit { prefs ->
            prefs[KEY_SESSION] = json.encodeToString(session.toStored())
        }
    }

    suspend fun clear() {
        dataStore.edit { prefs -> prefs.remove(KEY_SESSION) }
    }

    private fun StoredSession.toModel() = UserSession(
        uid = uid,
        companyId = companyId,
        employeeId = employeeId,
        displayName = displayName,
        email = email,
        avatarUrl = avatarUrl,
        roles = roles.mapNotNull(RoleCode::fromCode).toSet(),
        branchIds = branchIds,
        companyName = companyName,
        features = CompanyFeatures(
            shifts = features.shifts,
            leave = features.leave,
            payroll = features.payroll,
            regularization = features.regularization,
            announcements = features.announcements,
            geofencing = features.geofencing,
            qrKiosk = features.qrKiosk,
            faceRecognition = features.faceRecognition,
        ),
    )

    private fun UserSession.toStored() = StoredSession(
        uid = uid,
        companyId = companyId,
        employeeId = employeeId,
        displayName = displayName,
        email = email,
        avatarUrl = avatarUrl,
        roles = roles.map { it.name },
        branchIds = branchIds,
        companyName = companyName,
        features = StoredFeatures(
            shifts = features.shifts,
            leave = features.leave,
            payroll = features.payroll,
            regularization = features.regularization,
            announcements = features.announcements,
            geofencing = features.geofencing,
            qrKiosk = features.qrKiosk,
            faceRecognition = features.faceRecognition,
        ),
    )

    private companion object {
        val KEY_SESSION = stringPreferencesKey("user_session_v1")
    }
}
