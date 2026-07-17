package app.worktrack.core.database.di

import android.content.Context
import androidx.room.Room
import app.worktrack.core.database.WorkTrackDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): WorkTrackDatabase =
        Room.databaseBuilder(context, WorkTrackDatabase::class.java, "worktrack.db")
            // v1 ships with destructive fallback OFF: schema changes require an
            // explicit Migration or a failed build, never silent data loss.
            .build()

    @Provides fun provideOrgDao(db: WorkTrackDatabase) = db.orgDao()
    @Provides fun provideAttendanceDao(db: WorkTrackDatabase) = db.attendanceDao()
    @Provides fun provideShiftDao(db: WorkTrackDatabase) = db.shiftDao()
    @Provides fun provideLeaveDao(db: WorkTrackDatabase) = db.leaveDao()
    @Provides fun providePayslipDao(db: WorkTrackDatabase) = db.payslipDao()
    @Provides fun provideAnnouncementDao(db: WorkTrackDatabase) = db.announcementDao()
    @Provides fun provideOutboxDao(db: WorkTrackDatabase) = db.outboxDao()
    @Provides fun provideSyncCursorDao(db: WorkTrackDatabase) = db.syncCursorDao()
}
