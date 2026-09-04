package app.worktrack.core.network.interceptor

import app.worktrack.core.network.auth.AuthTokenProvider
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the Firebase ID token plus client metadata headers. runBlocking is
 * safe here: OkHttp interceptors always execute on OkHttp's dispatcher threads,
 * and the Firebase SDK serves cached tokens without I/O in the common case.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: AuthTokenProvider,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = runBlocking { tokenProvider.idToken() }

        val request = original.newBuilder()
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .header("X-Client", "worktrack-android")
            .build()

        val response = chain.proceed(request)

        // One retry with a force-refreshed token covers expiry races.
        if (response.code == 401 && token != null) {
            val refreshed = runBlocking { tokenProvider.idToken(forceRefresh = true) }
            if (refreshed != null && refreshed != token) {
                response.close()
                return chain.proceed(
                    original.newBuilder()
                        .header("Authorization", "Bearer $refreshed")
                        .header("X-Client", "worktrack-android")
                        .build(),
                )
            }
        }
        return response
    }
}
