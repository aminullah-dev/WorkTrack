package app.worktrack.core.domain.usecase.auth

import app.worktrack.core.domain.repository.AuthRepository
import app.worktrack.core.model.UserSession
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

class ObserveSessionUseCase @Inject constructor(
    private val authRepository: AuthRepository,
) {
    operator fun invoke(): Flow<UserSession?> = authRepository.session
}
