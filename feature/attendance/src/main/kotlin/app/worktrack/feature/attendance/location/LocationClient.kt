package app.worktrack.feature.attendance.location

import android.Manifest
import android.annotation.SuppressLint
import android.os.Build
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import javax.inject.Inject
import kotlinx.coroutines.tasks.await

data class DeviceLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val isMock: Boolean,
)

/**
 * One-shot high-accuracy location fix for punching. Callers must hold
 * ACCESS_FINE_LOCATION before invoking; the screen gates on the permission.
 */
class LocationClient @Inject constructor(
    private val fusedClient: FusedLocationProviderClient,
) {

    @SuppressLint("MissingPermission")
    @androidx.annotation.RequiresPermission(Manifest.permission.ACCESS_FINE_LOCATION)
    suspend fun currentLocation(): DeviceLocation? {
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(TIMEOUT_MILLIS)
            .setMaxUpdateAgeMillis(MAX_AGE_MILLIS)
            .build()

        val location = fusedClient
            .getCurrentLocation(request, CancellationTokenSource().token)
            .await() ?: return null

        val isMock = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }
        return DeviceLocation(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy,
            isMock = isMock,
        )
    }

    private companion object {
        const val TIMEOUT_MILLIS = 15_000L
        const val MAX_AGE_MILLIS = 10_000L // a stale fix is worse than a short wait
    }
}
