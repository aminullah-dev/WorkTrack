package app.worktrack.core.model

import java.time.Instant

data class Company(
    val id: String,
    val name: String,
    val legalName: String?,
    val timezone: String,
    val currency: String,
)

data class Branch(
    val id: String,
    val companyId: String,
    val name: String,
    val code: String,
    val address: String?,
    val latitude: Double?,
    val longitude: Double?,
    val radiusMeters: Int?,
    val timezone: String,
    val updatedAt: Instant,
)

data class Geofence(
    val id: String,
    val companyId: String,
    val branchId: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Int,
    val active: Boolean,
    val updatedAt: Instant,
)

data class Department(
    val id: String,
    val companyId: String,
    val branchId: String?,
    val name: String,
    val code: String,
)

data class Position(
    val id: String,
    val companyId: String,
    val title: String,
    val code: String,
    val level: Int?,
)
