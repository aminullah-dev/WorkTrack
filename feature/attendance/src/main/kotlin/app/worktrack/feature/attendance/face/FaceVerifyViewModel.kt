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
                    // A match without a token is unusable: the punch would be
                    // recorded as unverified, so treat it as a failure.
                    verification.match && verification.token != null ->
                        FaceCaptureResult.Success(verification.token)

                    verification.match -> FaceCaptureResult.Failed
                    else -> FaceCaptureResult.NoMatch
                }
            }

            is AppResult.Failure -> FaceCaptureResult.Failed
        }
}
