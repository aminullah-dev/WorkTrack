package app.worktrack.core.data.di

import app.worktrack.core.common.coroutines.DefaultDispatcherProvider
import app.worktrack.core.common.coroutines.DispatcherProvider
import app.worktrack.core.common.time.SystemTimeProvider
import app.worktrack.core.common.time.TimeProvider
import app.worktrack.core.data.auth.FirebaseAuthTokenProvider
import app.worktrack.core.data.repository.AnnouncementRepositoryImpl
import app.worktrack.core.data.repository.AttendanceRepositoryImpl
import app.worktrack.core.data.repository.AuthRepositoryImpl
import app.worktrack.core.data.repository.LeaveRepositoryImpl
import app.worktrack.core.data.repository.PayslipRepositoryImpl
import app.worktrack.core.data.repository.SyncRepositoryImpl
import app.worktrack.core.domain.repository.AnnouncementRepository
import app.worktrack.core.domain.repository.AttendanceRepository
import app.worktrack.core.domain.repository.AuthRepository
import app.worktrack.core.domain.repository.LeaveRepository
import app.worktrack.core.domain.repository.PayslipRepository
import app.worktrack.core.domain.repository.SyncRepository
import app.worktrack.core.network.auth.AuthTokenProvider
import com.google.firebase.auth.FirebaseAuth
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
interface DataModule {

    @Binds fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository
    @Binds fun bindAttendanceRepository(impl: AttendanceRepositoryImpl): AttendanceRepository
    @Binds fun bindLeaveRepository(impl: LeaveRepositoryImpl): LeaveRepository
    @Binds fun bindPayslipRepository(impl: PayslipRepositoryImpl): PayslipRepository
    @Binds fun bindAnnouncementRepository(impl: AnnouncementRepositoryImpl): AnnouncementRepository
    @Binds fun bindSyncRepository(impl: SyncRepositoryImpl): SyncRepository
    @Binds fun bindAuthTokenProvider(impl: FirebaseAuthTokenProvider): AuthTokenProvider
    @Binds fun bindTimeProvider(impl: SystemTimeProvider): TimeProvider
    @Binds fun bindDispatcherProvider(impl: DefaultDispatcherProvider): DispatcherProvider

    companion object {
        @Provides
        @Singleton
        fun provideFirebaseAuth(): FirebaseAuth = FirebaseAuth.getInstance()
    }
}
