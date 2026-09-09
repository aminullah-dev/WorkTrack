package app.worktrack.core.network.auth

/**
 * Supplies the bearer token for API calls. Implemented over Firebase Auth in
 * :core:data so that :core:network stays free of the Firebase dependency.
 */
interface AuthTokenProvider {

    /**
     * Returns a currently valid ID token, refreshing if needed, or null when
     * signed out. Must be safe to call from any thread.
     */
    suspend fun idToken(forceRefresh: Boolean = false): String?
}
