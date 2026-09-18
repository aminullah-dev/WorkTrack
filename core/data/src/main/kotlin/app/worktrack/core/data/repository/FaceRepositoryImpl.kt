package app.worktrack.core.data.repository

import app.worktrack.core.common.result.AppResult
import app.worktrack.core.common.result.map
import app.worktrack.core.domain.repository.FaceRepository
import app.worktrack.core.domain.repository.FaceVerification
import app.worktrack.core.network.WorkTrackApi
import app.worktrack.core.network.apiCall
import app.worktrack.core.network.dto.FaceEmbeddingDto
import javax.inject.Inject

class FaceRepositoryImpl @Inject constructor(
    private val api: WorkTrackApi,
) : FaceRepository {

    override suspend fun enroll(embedding: List<Float>): AppResult<Unit> =
        apiCall { api.enrollFace(FaceEmbeddingDto(embedding)) }.map { }

    override suspend fun verify(embedding: List<Float>): AppResult<FaceVerification> =
        apiCall { api.verifyFace(FaceEmbeddingDto(embedding)) }.map { env ->
            FaceVerification(
                match = env.data.match,
                similarity = env.data.similarity,
                enrolled = env.data.enrolled,
                token = env.data.token,
            )
        }
}
