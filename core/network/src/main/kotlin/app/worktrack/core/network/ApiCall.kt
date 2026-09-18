package app.worktrack.core.network

import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.network.dto.ProblemDto
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

private val problemJson = Json { ignoreUnknownKeys = true }

/**
 * Runs one API call and converts transport/protocol failures into the app-wide
 * [AppError] taxonomy. The only place HttpException/IOException are handled.
 */
suspend fun <T> apiCall(block: suspend () -> T): AppResult<T> = try {
    AppResult.success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    AppResult.failure(e.toAppError())
} catch (e: IOException) {
    AppResult.failure(AppError.Network)
} catch (e: SerializationException) {
    AppResult.failure(AppError.Unexpected(e))
}

private fun HttpException.toAppError(): AppError {
    val problem = try {
        response()?.errorBody()?.string()
            ?.takeIf { it.isNotBlank() }
            ?.let { problemJson.decodeFromString<ProblemDto>(it) }
    } catch (_: SerializationException) {
        null
    }

    return when (code()) {
        401 -> AppError.Unauthenticated
        403 -> AppError.PermissionDenied
        404 -> AppError.NotFound
        400, 422 ->
            if (problem?.code != null && problem.fieldErrors.isEmpty()) {
                AppError.Business(problem.code, problem.detail ?: problem.title ?: "Request rejected")
            } else {
                AppError.Validation(
                    message = problem?.detail ?: problem?.title ?: "Invalid request",
                    fieldErrors = problem?.fieldErrors.orEmpty(),
                )
            }

        409 -> AppError.Business(
            code = problem?.code ?: "CONFLICT",
            message = problem?.detail ?: "The resource changed on the server",
        )

        else -> AppError.Http(code(), problem?.code, problem?.detail ?: problem?.title)
    }
}
