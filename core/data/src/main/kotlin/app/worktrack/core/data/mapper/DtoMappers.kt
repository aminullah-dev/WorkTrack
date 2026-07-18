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
import app.worktrack.core.database.entity.PayslipEntity
import app.worktrack.core.database.entity.PayslipLineEntity
import app.worktrack.core.database.entity.ShiftAssignmentEntity
import app.worktrack.core.database.entity.ShiftEntity
import app.worktrack.core.model.CompanyFeatures
import app.worktrack.core.model.LeaveStatus
import app.worktrack.core.model.PunchMethod
import app.worktrack.core.model.PunchType
import app.worktrack.core.model.RoleCode
import app.worktrack.core.model.SyncStatus
import app.worktrack.core.model.UserSession
import app.worktrack.core.network.dto.AnnouncementDto
import app.worktrack.core.network.dto.AttendanceDayDto
import app.worktrack.core.network.dto.BranchDto
import app.worktrack.core.network.dto.EmployeeDto
import app.worktrack.core.network.dto.GeofenceDto
import app.worktrack.core.network.dto.LeaveBalanceDto
import app.worktrack.core.network.dto.LeaveRequestDto
import app.worktrack.core.network.dto.LeaveTypeDto
import app.worktrack.core.network.dto.MeDto
import app.worktrack.core.network.dto.PayslipDto
import app.worktrack.core.network.dto.PunchDto
import app.worktrack.core.network.dto.ShiftAssignmentDto
import app.worktrack.core.network.dto.ShiftDto
import java.time.LocalTime

/** Server DTO -> Room entity. Server rows always land as SYNCED. */

private inline fun <reified T : Enum<T>> String.toEnumOr(default: T): T =
    enumValues<T>().firstOrNull { it.name == this } ?: default

fun MeDto.toSession() = UserSession(
    uid = uid,
    companyId = companyId,
    employeeId = employeeId,
    displayName = displayName,
    email = email,
    avatarUrl = avatarUrl,
    roles = roles.mapNotNull(RoleCode::fromCode).toSet(),
    branchIds = branchIds,
    companyName = companyName,
    features = CompanyFeatures(
        shifts = features.shifts,
        leave = features.leave,
        payroll = features.payroll,
        regularization = features.regularization,
        announcements = features.announcements,
        geofencing = features.geofencing,
        qrKiosk = features.qrKiosk,
        faceRecognition = features.faceRecognition,
    ),
)

fun BranchDto.toEntity() = BranchEntity(
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

fun GeofenceDto.toEntity() = GeofenceEntity(
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

fun EmployeeDto.toEntity() = EmployeeEntity(
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
    employmentType = employmentType,
    joinDateEpochDay = joinDate.toEpochDay(),
    status = status,
    updatedAt = updatedAt,
)

fun ShiftDto.toEntity() = ShiftEntity(
    id = id,
    companyId = companyId,
    name = name,
    code = code,
    startTimeSecondOfDay = LocalTime.parse(startTime).toSecondOfDay(),
    endTimeSecondOfDay = LocalTime.parse(endTime).toSecondOfDay(),
    breakMinutes = breakMinutes,
    graceInMinutes = graceInMinutes,
    graceOutMinutes = graceOutMinutes,
    isNightShift = isNightShift,
    active = active,
    updatedAt = updatedAt,
)

fun ShiftAssignmentDto.toEntity() = ShiftAssignmentEntity(
    id = id,
    companyId = companyId,
    employeeId = employeeId,
    shiftId = shiftId,
    date = date,
    branchId = branchId,
    source = source,
    updatedAt = updatedAt,
)

fun PunchDto.toEntity() = AttendancePunchEntity(
    id = id,
    companyId = companyId,
    employeeId = employeeId,
    punchedAt = punchedAt,
    type = type.toEnumOr(PunchType.IN),
    method = method.toEnumOr(PunchMethod.MANUAL),
    latitude = latitude,
    longitude = longitude,
    accuracyMeters = accuracyMeters,
    geofenceId = geofenceId,
    insideFence = insideFence,
    note = note,
    serverValidated = serverValidated,
    invalidReason = invalidReason,
    syncStatus = SyncStatus.SYNCED,
)

fun AttendanceDayDto.toEntity() = AttendanceDayEntity(
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
    status = status,
)

fun LeaveTypeDto.toEntity() = LeaveTypeEntity(
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

fun LeaveBalanceDto.toEntity() = LeaveBalanceEntity(
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

fun LeaveRequestDto.toEntity(syncStatus: SyncStatus = SyncStatus.SYNCED) = LeaveRequestEntity(
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
    status = status.toEnumOr(LeaveStatus.PENDING),
    currentApproverId = currentApproverId,
    decidedAt = decidedAt,
    decisionNote = decisionNote,
    createdAt = createdAt,
    updatedAt = updatedAt,
    syncStatus = syncStatus,
)

fun PayslipDto.toEntity() = PayslipEntity(
    id = id,
    companyId = companyId,
    runId = runId,
    employeeId = employeeId,
    periodYear = periodYear,
    periodMonth = periodMonth,
    currency = currency,
    gross = gross,
    totalDeductions = totalDeductions,
    net = net,
    workedDays = workedDays,
    paidLeaveDays = paidLeaveDays,
    lopDays = lopDays,
    overtimeMinutes = overtimeMinutes,
    status = status,
    pdfUrl = pdfUrl,
    updatedAt = updatedAt,
)

fun PayslipDto.toLineEntities(): List<PayslipLineEntity> = lines.map {
    PayslipLineEntity(
        payslipId = id,
        componentCode = it.componentCode,
        componentName = it.componentName,
        type = it.type,
        amount = it.amount,
    )
}

fun AnnouncementDto.toEntity() = AnnouncementEntity(
    id = id,
    companyId = companyId,
    title = title,
    body = body,
    priority = priority,
    publishedAt = publishedAt,
    expiresAt = expiresAt,
    createdByName = createdByName,
    updatedAt = updatedAt,
)
