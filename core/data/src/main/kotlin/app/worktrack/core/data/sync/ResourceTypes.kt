package app.worktrack.core.data.sync

/**
 * Wire names for replicated resource types. Must match the backend's sync
 * registry (backend/functions/src/routes/sync.ts) exactly.
 */
object ResourceTypes {
    const val BRANCHES = "branches"
    const val GEOFENCES = "geofences"
    const val EMPLOYEES = "employees"
    const val SHIFTS = "shifts"
    const val SHIFT_ASSIGNMENTS = "shiftAssignments"
    const val PUNCHES = "punches"
    const val ATTENDANCE_DAYS = "attendanceDays"
    const val REGULARIZATIONS = "regularizations"
    const val LEAVE_TYPES = "leaveTypes"
    const val LEAVE_BALANCES = "leaveBalances"
    const val LEAVE_REQUESTS = "leaveRequests"
    const val PAYSLIPS = "payslips"
    const val ANNOUNCEMENTS = "announcements"

    /** Pull order: reference data first so later types can resolve foreign keys. */
    val pullOrder: List<String> = listOf(
        BRANCHES,
        GEOFENCES,
        EMPLOYEES,
        SHIFTS,
        SHIFT_ASSIGNMENTS,
        LEAVE_TYPES,
        LEAVE_BALANCES,
        LEAVE_REQUESTS,
        PUNCHES,
        ATTENDANCE_DAYS,
        PAYSLIPS,
        ANNOUNCEMENTS,
    )
}

object OutboxOpTypes {
    const val CREATE = "CREATE"
    const val UPDATE = "UPDATE"
    const val DELETE = "DELETE"
}
