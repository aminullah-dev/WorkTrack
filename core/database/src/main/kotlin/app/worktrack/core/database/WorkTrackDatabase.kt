package app.worktrack.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import app.worktrack.core.database.converter.Converters
import app.worktrack.core.database.dao.AnnouncementDao
import app.worktrack.core.database.dao.AttendanceDao
import app.worktrack.core.database.dao.LeaveDao
import app.worktrack.core.database.dao.OrgDao
import app.worktrack.core.database.dao.OutboxDao
import app.worktrack.core.database.dao.PayslipDao
import app.worktrack.core.database.dao.ShiftDao
import app.worktrack.core.database.dao.SyncCursorDao
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
import app.worktrack.core.database.entity.SyncCursorEntity

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
        OutboxEntryEntity::class,
        SyncCursorEntity::class,
    ],
    version = 1,
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
    abstract fun outboxDao(): OutboxDao
    abstract fun syncCursorDao(): SyncCursorDao
}
