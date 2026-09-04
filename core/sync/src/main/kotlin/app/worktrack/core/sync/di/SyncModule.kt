package app.worktrack.core.sync.di

import app.worktrack.core.domain.repository.SyncScheduler
import app.worktrack.core.sync.WorkManagerSyncScheduler
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
interface SyncModule {

    @Binds
    fun bindSyncScheduler(impl: WorkManagerSyncScheduler): SyncScheduler
}
