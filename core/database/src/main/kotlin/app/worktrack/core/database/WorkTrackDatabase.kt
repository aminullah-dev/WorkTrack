package app.worktrack.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import app.worktrack.core.database.converter.Converters
import app.worktrack.core.database.dao.AnnouncementDao
import app.worktrack.core.database.dao.AttendanceDao
import app.worktrack.core.database.dao.LeaveDao
import app.worktrack.core.database.dao.OrgDao
import app.worktrack.core.database.dao.OutboxDao
import app.worktrack.core.database.dao.PayslipDao
import app.worktrack.core.database.dao.ShiftDao
import app.worktrack.core.database.dao.SyncCursorDao
import app.worktrack.core.database.dao.WorkDao
import app.worktrack.core.database.entity.AnnouncementEntity
import app.worktrack.core.database.entity.AttendanceDayEntity
import app.worktrack.core.database.entity.AttendancePunchEntity
import app.worktrack.core.database.entity.BranchEntity
import app.worktrack.core.database.entity.EmployeeEntity
import app.worktrack.core.database.entity.GeofenceEntity
import app.worktrack.core.database.entity.LeaveBalanceEntity
import app.worktrack.core.database.entity.LeaveRequestEntity
import app.worktrack.core.database.entity.LeaveTypeEntity
import app.worktrack.core.database.entity.OutboxEntryEntity
import app.worktrack.core.database.entity.PayslipEntity
import app.worktrack.core.database.entity.PayslipLineEntity
import app.worktrack.core.database.entity.ShiftAssignmentEntity
import app.worktrack.core.database.entity.ShiftEntity
import app.worktrack.core.database.entity.ProjectEntity
import app.worktrack.core.database.entity.SyncCursorEntity
import app.worktrack.core.database.entity.TaskEntity

@Database(
    entities = [
        BranchEntity::class,
        GeofenceEntity::class,
        EmployeeEntity::class,
        AttendancePunchEntity::class,
        AttendanceDayEntity::class,
        ShiftEntity::class,
        ShiftAssignmentEntity::class,
        LeaveTypeEntity::class,
        LeaveBalanceEntity::class,
        LeaveRequestEntity::class,
        PayslipEntity::class,
        PayslipLineEntity::class,
        AnnouncementEntity::class,
        ProjectEntity::class,
        TaskEntity::class,
        OutboxEntryEntity::class,
        SyncCursorEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class WorkTrackDatabase : RoomDatabase() {
    abstract fun orgDao(): OrgDao
    abstract fun attendanceDao(): AttendanceDao
    abstract fun shiftDao(): ShiftDao
    abstract fun leaveDao(): LeaveDao
    abstract fun payslipDao(): PayslipDao
    abstract fun announcementDao(): AnnouncementDao
    abstract fun workDao(): WorkDao
    abstract fun outboxDao(): OutboxDao
    abstract fun syncCursorDao(): SyncCursorDao
}

/**
 * v1 -> v2: work assignment (projects and tasks).
 *
 * Additive only — two new tables, nothing existing is touched — so a phone
 * upgrading in the field keeps its punches, its pending outbox and its
 * payslips. Written by hand rather than left to a destructive fallback: an
 * employee whose punch has not synced yet must not lose it to an app update.
 */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Copied verbatim from schemas/…/2.json so the tables Room validates on
        // open are the tables this creates, character for character.
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `projects` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `code` TEXT NOT NULL, `status` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
        )
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS `tasks` (`id` TEXT NOT NULL, `projectId` TEXT NOT NULL, `projectName` TEXT NOT NULL, `title` TEXT NOT NULL, `detail` TEXT, `location` TEXT, `startDate` INTEGER NOT NULL, `endDate` INTEGER NOT NULL, `status` TEXT NOT NULL, `priority` TEXT NOT NULL, `teamName` TEXT, `assigneeNames` TEXT NOT NULL, `updatedAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_tasks_endDate` ON `tasks` (`endDate`)")
    }
}
