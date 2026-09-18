package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import java.time.Instant
import kotlinx.serialization.Serializable

@Serializable
data class PayslipLineDto(
    val componentCode: String,
    val componentName: String,
    val type: String,
    val amount: Double,
)

@Serializable
data class PayslipDto(
    val id: String,
    val companyId: String,
    val runId: String,
    val employeeId: String,
    val periodYear: Int,
    val periodMonth: Int,
    val currency: String,
    val gross: Double,
    val totalDeductions: Double,
    val net: Double,
    val workedDays: Double = 0.0,
    val paidLeaveDays: Double = 0.0,
    val lopDays: Double = 0.0,
    val overtimeMinutes: Int = 0,
    val status: String,
    val pdfUrl: String? = null,
    val lines: List<PayslipLineDto> = emptyList(),
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)
