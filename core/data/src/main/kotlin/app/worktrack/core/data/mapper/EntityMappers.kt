package app.worktrack.core.data.mapper

import app.worktrack.core.database.entity.AnnouncementEntity
import app.worktrack.core.database.entity.AttendanceDayEntity
import app.worktrack.core.database.entity.AttendancePunchEntity
import app.worktrack.core.database.entity.BranchEntity
import app.worktrack.core.database.entity.EmployeeEntity
import app.worktrack.core.database.entity.GeofenceEntity
import app.worktrack.core.database.entity.LeaveBalanceEntity
import app.worktrack.core.database.entity.LeaveRequestEntity
import app.worktrack.core.database.entity.LeaveTypeEntity
import app.worktrack.core.database.entity.PayslipWithLines
import app.worktrack.core.database.entity.ShiftEntity
import app.worktrack.core.model.Announcement
import app.worktrack.core.model.AnnouncementPriority
import app.worktrack.core.model.AttendanceDay
import app.worktrack.core.model.AttendanceDayStatus
import app.worktrack.core.model.AttendancePunch
import app.worktrack.core.model.Branch
import app.worktrack.core.model.Employee
import app.worktrack.core.model.EmployeeStatus
import app.worktrack.core.model.EmploymentType
import app.worktrack.core.model.Geofence
import app.worktrack.core.model.LeaveBalance
import app.worktrack.core.model.LeaveRequest
import app.worktrack.core.model.LeaveType
import app.worktrack.core.model.PayComponentType
import app.worktrack.core.model.Payslip
import app.worktrack.core.model.PayslipLine
import app.worktrack.core.model.PayslipStatus
import app.worktrack.core.model.Shift
import java.time.LocalDate
import java.time.LocalTime

/** Room entity -> domain model. Unknown enum names degrade to safe defaults. */

private inline fun <reified T : Enum<T>> String.toEnumOr(default: T): T =
    enumValues<T>().firstOrNull { it.name == this } ?: default

fun BranchEntity.toModel() = Branch(
    id = id,
    companyId = companyId,
    name = name,
    code = code,
    address = address,
    latitude = latitude,
    longitude = longitude,
    radiusMeters = radiusMeters,
    timezone = timezone,
    updatedAt = updatedAt,
)

fun GeofenceEntity.toModel() = Geofence(
    id = id,
    companyId = companyId,
    branchId = branchId,
    name = name,
    latitude = latitude,
    longitude = longitude,
    radiusMeters = radiusMeters,
    active = active,
    updatedAt = updatedAt,
)

fun EmployeeEntity.toModel() = Employee(
    id = id,
    companyId = companyId,
    employeeCode = employeeCode,
    firstName = firstName,
    lastName = lastName,
    email = email,
    phone = phone,
    avatarUrl = avatarUrl,
    branchId = branchId,
    departmentId = departmentId,
    positionId = positionId,
    managerId = managerId,
    employmentType = employmentType.toEnumOr(EmploymentType.FULL_TIME),
    joinDate = LocalDate.ofEpochDay(joinDateEpochDay),
    status = status.toEnumOr(EmployeeStatus.ACTIVE),
    updatedAt = updatedAt,
)

fun AttendancePunchEntity.toModel() = AttendancePunch(
    id = id,
    companyId = companyId,
    employeeId = employeeId,
    punchedAt = punchedAt,
    type = type,
    method = method,
    latitude = latitude,
    longitude = longitude,
    accuracyMeters = accuracyMeters,
    geofenceId = geofenceId,
    insideFence = insideFence,
    note = note,
    serverValidated = serverValidated,
    invalidReason = invalidReason,
    syncStatus = syncStatus,
)

fun AttendanceDayEntity.toModel() = AttendanceDay(
    id = id,
    employeeId = employeeId,
    date = date,
    shiftId = shiftId,
    firstInAt = firstInAt,
    lastOutAt = lastOutAt,
    workedMinutes = workedMinutes,
    lateMinutes = lateMinutes,
    earlyOutMinutes = earlyOutMinutes,
    overtimeMinutes = overtimeMinutes,
    status = status.toEnumOr(AttendanceDayStatus.PENDING),
)

fun ShiftEntity.toModel() = Shift(
    id = id,
    companyId = companyId,
    name = name,
    code = code,
    startTime = LocalTime.ofSecondOfDay(startTimeSecondOfDay.toLong()),
    endTime = LocalTime.ofSecondOfDay(endTimeSecondOfDay.toLong()),
    breakMinutes = breakMinutes,
    graceInMinutes = graceInMinutes,
    graceOutMinutes = graceOutMinutes,
    isNightShift = isNightShift,
    active = active,
    updatedAt = updatedAt,
)

fun LeaveTypeEntity.toModel() = LeaveType(
    id = id,
    companyId = companyId,
    name = name,
    code = code,
    colorHex = colorHex,
    isPaid = isPaid,
    requiresAttachment = requiresAttachment,
    active = active,
    updatedAt = updatedAt,
)

fun LeaveBalanceEntity.toModel() = LeaveBalance(
    id = id,
    employeeId = employeeId,
    leaveTypeId = leaveTypeId,
    periodYear = periodYear,
    entitledDays = entitledDays,
    accruedDays = accruedDays,
    usedDays = usedDays,
    carriedOverDays = carriedOverDays,
    pendingDays = pendingDays,
    updatedAt = updatedAt,
)

fun LeaveRequestEntity.toModel() = LeaveRequest(
    id = id,
    companyId = companyId,
    employeeId = employeeId,
    employeeName = employeeName,
    leaveTypeId = leaveTypeId,
    startDate = startDate,
    endDate = endDate,
    startHalfDay = startHalfDay,
    endHalfDay = endHalfDay,
    days = days,
    reason = reason,
    status = status,
    currentApproverId = currentApproverId,
    decidedAt = decidedAt,
    decisionNote = decisionNote,
    createdAt = createdAt,
    updatedAt = updatedAt,
    syncStatus = syncStatus,
)

fun PayslipWithLines.toModel() = Payslip(
    id = payslip.id,
    companyId = payslip.companyId,
    runId = payslip.runId,
    employeeId = payslip.employeeId,
    periodYear = payslip.periodYear,
    periodMonth = payslip.periodMonth,
    currency = payslip.currency,
    gross = payslip.gross,
    totalDeductions = payslip.totalDeductions,
    net = payslip.net,
    workedDays = payslip.workedDays,
    paidLeaveDays = payslip.paidLeaveDays,
    lopDays = payslip.lopDays,
    overtimeMinutes = payslip.overtimeMinutes,
    status = payslip.status.toEnumOr(PayslipStatus.FINALIZED),
    pdfUrl = payslip.pdfUrl,
    lines = lines.map {
        PayslipLine(
            componentCode = it.componentCode,
            componentName = it.componentName,
            type = it.type.toEnumOr(PayComponentType.EARNING),
            amount = it.amount,
        )
    },
    updatedAt = payslip.updatedAt,
)

fun AnnouncementEntity.toModel() = Announcement(
    id = id,
    companyId = companyId,
    title = title,
    body = body,
    priority = priority.toEnumOr(AnnouncementPriority.NORMAL),
    publishedAt = publishedAt,
    expiresAt = expiresAt,
    createdByName = createdByName,
    updatedAt = updatedAt,
)
