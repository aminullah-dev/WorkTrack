package app.worktrack.core.database.entity

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation
import java.time.Instant

@Entity(
    tableName = "payslips",
    indices = [Index(value = ["employeeId", "periodYear", "periodMonth"], unique = true)],
)
data class PayslipEntity(
    @PrimaryKey val id: String,
    val companyId: String,
    val runId: String,
    val employeeId: String,
    val periodYear: Int,
    val periodMonth: Int,
    val currency: String,
    val gross: Double,
    val totalDeductions: Double,
    val net: Double,
    val workedDays: Double,
    val paidLeaveDays: Double,
    val lopDays: Double,
    val overtimeMinutes: Int,
    val status: String,
    val pdfUrl: String?,
    val updatedAt: Instant,
)

@Entity(
    tableName = "payslip_lines",
    primaryKeys = ["payslipId", "componentCode"],
    foreignKeys = [
        ForeignKey(
            entity = PayslipEntity::class,
            parentColumns = ["id"],
            childColumns = ["payslipId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("payslipId")],
)
data class PayslipLineEntity(
    val payslipId: String,
    val componentCode: String,
    val componentName: String,
    val type: String,
    val amount: Double,
)

data class PayslipWithLines(
    @Embedded val payslip: PayslipEntity,
    @Relation(parentColumn = "id", entityColumn = "payslipId")
    val lines: List<PayslipLineEntity>,
)
