package app.worktrack.core.domain.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.model.UserSession
import kotlinx.coroutines.flow.Flow

interface AuthRepository {

    /** Emits the current session, or null when signed out. Backed by DataStore. */
    val session: Flow<UserSession?>

    /**
     * Authenticates against Firebase Auth, then resolves tenant context via
     * GET /me and persists the session locally.
     */
    suspend fun signIn(email: String, password: String): AppResult<UserSession>

    /** Re-fetches GET /me (roles/claims may have changed) and updates the stored session. */
    suspend fun refreshSession(): AppResult<UserSession>

    suspend fun sendPasswordReset(email: String): AppResult<Unit>

    /** Signs out of Firebase, clears the session, local database, and pending outbox. */
    suspend fun signOut()
}
