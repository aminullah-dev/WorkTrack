package app.worktrack.core.model

import java.time.Instant
import java.time.LocalDate

enum class EmploymentType { FULL_TIME, PART_TIME, CONTRACT, INTERN }

enum class EmployeeStatus { ACTIVE, ON_LEAVE, SUSPENDED, EXITED }

/** Built-in platform roles; custom roles resolve to permission sets server-side. */
enum class RoleCode {
    SUPER_ADMIN,
    COMPANY_ADMIN,
    HR_ADMIN,
    PAYROLL_ADMIN,
    BRANCH_MANAGER,
    TEAM_LEAD,
    EMPLOYEE,
    AUDITOR,
    KIOSK,
    ;

    companion object {
        fun fromCode(code: String): RoleCode? = entries.firstOrNull { it.name == code }
    }
}

data class Employee(
    val id: String,
    val companyId: String,
    val employeeCode: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val phone: String?,
    val avatarUrl: String?,
    val branchId: String?,
    val departmentId: String?,
    val positionId: String?,
    val managerId: String?,
    val employmentType: EmploymentType,
    val joinDate: LocalDate,
    val status: EmployeeStatus,
    val updatedAt: Instant,
) {
    val fullName: String get() = "$firstName $lastName".trim()
}

/**
 * The authenticated user's resolved context: identity plus tenant scoping and
 * roles from Firebase custom claims, refreshed from GET /me.
 */
/** Company module toggles configured by the admin; unknown → enabled. */
data class CompanyFeatures(
    val shifts: Boolean = true,
    val leave: Boolean = true,
    val payroll: Boolean = true,
    val regularization: Boolean = true,
    val announcements: Boolean = true,
    val geofencing: Boolean = true,
    val qrKiosk: Boolean = true,
    val faceRecognition: Boolean = true,
)

data class UserSession(
    val uid: String,
    val companyId: String,
    val employeeId: String,
    val displayName: String,
    val email: String,
    val avatarUrl: String?,
    val roles: Set<RoleCode>,
    val branchIds: List<String>,
    val companyName: String,
    val features: CompanyFeatures = CompanyFeatures(),
) {
    fun hasAnyRole(vararg candidates: RoleCode): Boolean = candidates.any { it in roles }

    val isApprover: Boolean
        get() = hasAnyRole(
            RoleCode.COMPANY_ADMIN,
            RoleCode.HR_ADMIN,
            RoleCode.BRANCH_MANAGER,
            RoleCode.TEAM_LEAD,
        )
}
