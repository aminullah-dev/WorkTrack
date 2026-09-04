package app.worktrack.core.network.dto

import kotlinx.serialization.Serializable

@Serializable
data class MeDto(
    val uid: String,
    val companyId: String,
    val companyName: String,
    val employeeId: String,
    val displayName: String,
    val email: String,
    val avatarUrl: String? = null,
    val roles: List<String> = emptyList(),
    val branchIds: List<String> = emptyList(),
    val features: MeFeaturesDto = MeFeaturesDto(),
)

/** Company module toggles (defaults on so older servers don't hide anything). */
@Serializable
data class MeFeaturesDto(
    val shifts: Boolean = true,
    val leave: Boolean = true,
    val payroll: Boolean = true,
    val regularization: Boolean = true,
    val announcements: Boolean = true,
    val geofencing: Boolean = true,
    val qrKiosk: Boolean = true,
    val faceRecognition: Boolean = true,
)
