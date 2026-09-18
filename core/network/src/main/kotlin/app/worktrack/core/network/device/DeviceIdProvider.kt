package app.worktrack.core.network.device

/**
 * Supplies this installation's licence device id. Implemented over DataStore in
 * :core:data so that :core:network stays free of the persistence dependency —
 * the same arrangement as AuthTokenProvider.
 */
interface DeviceIdProvider {

    /** Stable for the life of the install. Must be safe to call from any thread. */
    suspend fun deviceId(): String
}
