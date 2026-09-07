package app.worktrack.core.domain.usecase.auth

import app.worktrack.core.domain.repository.AuthRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow

/** Observes whether the biometric app lock (fingerprint/face) is enabled. */
class ObserveBiometricLockUseCase @Inject constructor(
    private val authRepository: AuthRepository,
) {
    operator fun invoke(): Flow<Boolean> = authRepository.biometricLockEnabled
}

/** Turns the biometric app lock on or off. */
class SetBiometricLockUseCase @Inject constructor(
    private val authRepository: AuthRepository,
) {
    suspend operator fun invoke(enabled: Boolean) = authRepository.setBiometricLock(enabled)
}
