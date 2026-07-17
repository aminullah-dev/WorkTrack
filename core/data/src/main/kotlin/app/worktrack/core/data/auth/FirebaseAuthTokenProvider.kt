package app.worktrack.core.data.auth

import app.worktrack.core.network.auth.AuthTokenProvider
import com.google.firebase.auth.FirebaseAuth
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await

@Singleton
class FirebaseAuthTokenProvider @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
) : AuthTokenProvider {

    override suspend fun idToken(forceRefresh: Boolean): String? =
        try {
            firebaseAuth.currentUser?.getIdToken(forceRefresh)?.await()?.token
        } catch (_: Exception) {
            // Offline or revoked: callers treat null as "no credential"; the API
            // responds 401 and the UI routes to re-authentication if needed.
            null
        }
}
