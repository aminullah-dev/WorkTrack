package app.worktrack.core.data.device

import app.worktrack.core.datastore.DeviceIdStore
import app.worktrack.core.network.device.DeviceIdProvider
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StoredDeviceIdProvider @Inject constructor(
    private val store: DeviceIdStore,
) : DeviceIdProvider {

    override suspend fun deviceId(): String = store.deviceId()
}
