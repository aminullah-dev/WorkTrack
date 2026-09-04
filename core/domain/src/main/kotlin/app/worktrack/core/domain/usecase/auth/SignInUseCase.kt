package app.worktrack.core.domain.usecase.auth

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.AuthRepository
import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.model.UserSession
import javax.inject.Inject

class SignInUseCase @Inject constructor(
    private val authRepository: AuthRepository,
    private val syncScheduler: SyncScheduler,
) {

    suspend operator fun invoke(email: String, password: String): AppResult<UserSession> {
        val trimmedEmail = email.trim()
        val fieldErrors = buildMap {
            if (!EMAIL_REGEX.matches(trimmedEmail)) put("email", "Enter a valid email address")
            if (password.length < MIN_PASSWORD_LENGTH) {
                put("password", "Password must be at least $MIN_PASSWORD_LENGTH characters")
            }
        }
        if (fieldErrors.isNotEmpty()) {
            return AppResult.failure(AppError.Validation("Check your credentials", fieldErrors))
        }
        return authRepository.signIn(trimmedEmail, password)
            .also { result ->
                if (result is AppResult.Success) {
                    // First sign-in on a device triggers the initial bootstrap sync.
                    syncScheduler.schedulePeriodicSync()
                    syncScheduler.requestImmediateSync()
                }
            }
    }

    private companion object {
        const val MIN_PASSWORD_LENGTH = 8
        val EMAIL_REGEX = Regex("^[A-Za-z0-9+_.\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$")
    }
}
