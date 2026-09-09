package app.worktrack.feature.attendance.face

import androidx.lifecycle.ViewModel
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.FaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class FaceVerifyViewModel @Inject constructor(
    private val faceRepository: FaceRepository,
) : ViewModel() {

    /**
     * Submits the on-device embedding. A rejected face, a missing enrollment and
     * a failed request are reported separately so the screen can say which one
     * happened instead of a blanket "try again".
     */
    suspend fun verify(embedding: List<Float>): FaceCaptureResult =
        when (val result = faceRepository.verify(embedding)) {
            is AppResult.Success -> {
                val verification = result.data
                when {
                    !verification.enrolled -> FaceCaptureResult.NotEnrolled
                    // A match goes through even when the server sent no token
                    // (an older deployment that predates them). Refusing here
                    // would block a check-in the server just confirmed, and it
                    // would buy nothing: only the server decides faceVerified,
                    // so a tokenless punch is simply recorded as unverified.
                    verification.match -> FaceCaptureResult.Success(verification.token)
                    else -> FaceCaptureResult.NoMatch
                }
            }

            is AppResult.Failure -> FaceCaptureResult.Failed
        }
}
