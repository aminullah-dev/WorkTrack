package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import app.worktrack.core.database.entity.PayslipEntity
import app.worktrack.core.database.entity.PayslipLineEntity
import app.worktrack.core.database.entity.PayslipWithLines
import kotlinx.coroutines.flow.Flow

@Dao
interface PayslipDao {

    @Transaction
    @Query(
        """
        SELECT * FROM payslips
        WHERE employeeId = :employeeId AND periodYear = :year
        ORDER BY periodMonth DESC
        """,
    )
    fun observePayslips(employeeId: String, year: Int): Flow<List<PayslipWithLines>>

    @Transaction
    @Query("SELECT * FROM payslips WHERE id = :payslipId")
    fun observePayslip(payslipId: String): Flow<PayslipWithLines?>

    @Upsert
    suspend fun upsertPayslips(payslips: List<PayslipEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLines(lines: List<PayslipLineEntity>)

    @Query("DELETE FROM payslip_lines WHERE payslipId = :payslipId")
    suspend fun deleteLines(payslipId: String)

    @Transaction
    suspend fun replacePayslip(payslip: PayslipEntity, lines: List<PayslipLineEntity>) {
        upsertPayslips(listOf(payslip))
        deleteLines(payslip.id)
        insertLines(lines)
    }

    @Query("DELETE FROM payslips")
    suspend fun clearPayslips()
}
