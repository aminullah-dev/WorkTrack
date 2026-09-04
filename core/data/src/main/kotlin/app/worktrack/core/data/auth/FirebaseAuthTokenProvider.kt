package app.worktrack.core.data.auth

import app.worktrack.core.network.auth.AuthTokenProvider
import com.google.firebase.auth.FirebaseAuth
import dagger.Lazy
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.tasks.await

@Singleton
class FirebaseAuthTokenProvider @Inject constructor(
    // Lazy so building the OkHttp/Retrofit graph never forces FirebaseAuth init.
    private val firebaseAuth: Lazy<FirebaseAuth>,
) : AuthTokenProvider {

    override suspend fun idToken(forceRefresh: Boolean): String? =
        try {
            firebaseAuth.get().currentUser?.getIdToken(forceRefresh)?.await()?.token
        } catch (_: Exception) {
            // Offline, revoked, or Firebase not configured: callers treat null as
            // "no credential"; the API responds 401 and the UI routes to
            // re-authentication if needed.
            null
        }
}
