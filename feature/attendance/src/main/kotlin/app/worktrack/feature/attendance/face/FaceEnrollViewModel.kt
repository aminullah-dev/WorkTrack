package app.worktrack.feature.attendance.face

import androidx.lifecycle.ViewModel
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.repository.FaceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class FaceEnrollViewModel @Inject constructor(
    private val faceRepository: FaceRepository,
) : ViewModel() {

    /**
     * Submits the on-device embedding for enrollment. Enrolling twice is refused
     * by the server (an admin must reset first), which is reported distinctly so
     * the employee knows to ask rather than keep retrying.
     */
    suspend fun enroll(embedding: List<Float>): FaceCaptureResult =
        when (val result = faceRepository.enroll(embedding)) {
            is AppResult.Success -> FaceCaptureResult.Success()
            is AppResult.Failure -> {
                val error = result.error
                if (error is AppError.Business && error.code == CODE_ALREADY_ENROLLED) {
                    FaceCaptureResult.AlreadyEnrolled
                } else {
                    FaceCaptureResult.Failed
                }
            }
        }

    private companion object {
        /** Mirrors the server's ErrorCodes.FACE_ALREADY_ENROLLED. */
        const val CODE_ALREADY_ENROLLED = "FACE_ALREADY_ENROLLED"
    }
}
