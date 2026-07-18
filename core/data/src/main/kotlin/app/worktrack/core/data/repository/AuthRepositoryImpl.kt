package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.common.result.onFailure
import app.worktrack.core.common.result.onSuccess
import app.worktrack.core.data.mapper.toSession
import app.worktrack.core.database.DatabaseCleaner
import app.worktrack.core.datastore.SessionStore
import app.worktrack.core.domain.repository.AuthRepository
import app.worktrack.core.model.UserSession
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val firebaseAuth: FirebaseAuth,
    private val api: WorkTrackApi,
    private val sessionStore: SessionStore,
    // DatabaseCleaner (not WorkTrackDatabase) so this module needs no Room on
    // its classpath; see DatabaseCleaner's doc for the rationale.
    private val databaseCleaner: DatabaseCleaner,
) : AuthRepository {

    override val session: Flow<UserSession?> = sessionStore.session

    override suspend fun signIn(email: String, password: String): AppResult<UserSession> {
        try {
            firebaseAuth.signInWithEmailAndPassword(email, password).await()
        } catch (e: CancellationException) {
            throw e
        } catch (e: FirebaseAuthInvalidUserException) {
            return AppResult.failure(invalidCredentials())
        } catch (e: FirebaseAuthInvalidCredentialsException) {
            return AppResult.failure(invalidCredentials())
        } catch (e: FirebaseNetworkException) {
            return AppResult.failure(AppError.Network)
        } catch (e: Exception) {
            return AppResult.failure(AppError.Unexpected(e))
        }

        // Resolve tenant context. A Firebase account without a provisioned
        // employee (no /me) must not end up half signed in.
        return apiCall { api.me() }
            .map { it.data.toSession() }
            .onSuccess { sessionStore.save(it) }
            .onFailure { firebaseAuth.signOut() }
    }

    override suspend fun refreshSession(): AppResult<UserSession> =
        apiCall { api.me() }
            .map { it.data.toSession() }
            .onSuccess { sessionStore.save(it) }

    override suspend fun sendPasswordReset(email: String): AppResult<Unit> = try {
        firebaseAuth.sendPasswordResetEmail(email.trim()).await()
        AppResult.success(Unit)
    } catch (e: CancellationException) {
        throw e
    } catch (e: FirebaseNetworkException) {
        AppResult.failure(AppError.Network)
    } catch (e: Exception) {
        // Do not reveal whether the account exists (user enumeration).
        AppResult.success(Unit)
    }

    override suspend fun signOut() {
        firebaseAuth.signOut()
        sessionStore.clear()
        // Tenant data never survives a sign-out on shared devices.
        databaseCleaner.clearAllTenantData()
    }

    private fun invalidCredentials() = AppError.Business(
        code = "INVALID_CREDENTIALS",
        message = "Email or password is incorrect",
    )
}
