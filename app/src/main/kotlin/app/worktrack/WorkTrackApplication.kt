package app.worktrack

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import app.worktrack.core.common.coroutines.ApplicationScope
import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.domain.usecase.auth.ObserveSessionUseCase
import app.worktrack.emulator.EmulatorConfig
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

@HiltAndroidApp
class WorkTrackApplication : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory

    @Inject lateinit var syncScheduler: SyncScheduler

    @Inject lateinit var observeSession: ObserveSessionUseCase

    @Inject @ApplicationScope lateinit var applicationScope: CoroutineScope

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()

        // Local demo: point Firebase Auth at the emulator before any auth call.
        if (BuildConfig.USE_EMULATORS) {
            EmulatorConfig.apply(this)
        }

        // Whenever a session exists (fresh sign-in or app restart), make sure the
        // periodic background sync is registered and kick one cycle immediately.
        observeSession()
            .filterNotNull()
            .distinctUntilChangedBy { it.uid }
            .onEach {
                syncScheduler.schedulePeriodicSync()
                syncScheduler.requestImmediateSync()
            }
            .launchIn(applicationScope)
    }
}
