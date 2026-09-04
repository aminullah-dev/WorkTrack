package app.worktrack.core.network

import app.worktrack.core.network.dto.AnnouncementDto
import app.worktrack.core.network.dto.ApiEnvelope
import app.worktrack.core.network.dto.AttendanceDayDto
import app.worktrack.core.network.dto.FaceEmbeddingDto
import app.worktrack.core.network.dto.FaceEnrollResultDto
import app.worktrack.core.network.dto.FaceVerifyResultDto
import app.worktrack.core.network.dto.LeaveDecisionDto
import app.worktrack.core.network.dto.LeaveRequestDto
import app.worktrack.core.network.dto.MeDto
import app.worktrack.core.network.dto.PayslipDto
import app.worktrack.core.network.dto.SyncPullResponseDto
import app.worktrack.core.network.dto.SyncPushRequestDto
import app.worktrack.core.network.dto.SyncPushResponseDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * WorkTrack REST API v1. Offline-capable mutations flow through POST /sync/push
 * (batched outbox operations); the endpoints here are session resolution,
 * windowed reads, and online-only decisions.
 */
interface WorkTrackApi {

    @GET("me")
    suspend fun me(): ApiEnvelope<MeDto>

    /** Enroll the caller's own face (on-device embedding, never a photo). */
    @POST("me/face/enroll")
    suspend fun enrollFace(@Body body: FaceEmbeddingDto): ApiEnvelope<FaceEnrollResultDto>

    /** Verify a face check-in against the caller's enrolled embedding. */
    @POST("attendance/face/verify")
    suspend fun verifyFace(@Body body: FaceEmbeddingDto): ApiEnvelope<FaceVerifyResultDto>

    @GET("attendance/days")
    suspend fun attendanceDays(
        @Query("from") from: String, // ISO date
        @Query("to") to: String,
    ): ApiEnvelope<List<AttendanceDayDto>>

    @GET("payslips")
    suspend fun payslips(
        @Query("year") year: Int,
    ): ApiEnvelope<List<PayslipDto>>

    @GET("announcements")
    suspend fun announcements(): ApiEnvelope<List<AnnouncementDto>>

    @GET("leave/requests")
    suspend fun leaveRequests(
        @Query("scope") scope: String, // mine | approvals
    ): ApiEnvelope<List<LeaveRequestDto>>

    @POST("leave/requests/{id}/decide")
    suspend fun decideLeaveRequest(
        @Path("id") requestId: String,
        @Body body: LeaveDecisionDto,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): ApiEnvelope<LeaveRequestDto>

    @POST("leave/requests/{id}/cancel")
    suspend fun cancelLeaveRequest(
        @Path("id") requestId: String,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): ApiEnvelope<LeaveRequestDto>

    @POST("sync/push")
    suspend fun syncPush(@Body body: SyncPushRequestDto): ApiEnvelope<SyncPushResponseDto>

    @GET("sync/pull")
    suspend fun syncPull(
        @Query("type") resourceType: String,
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int = 500,
    ): ApiEnvelope<SyncPullResponseDto>
}
