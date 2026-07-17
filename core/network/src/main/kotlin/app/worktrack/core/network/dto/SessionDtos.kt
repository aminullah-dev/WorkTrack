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
)
