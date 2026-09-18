package app.worktrack.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import app.worktrack.core.database.entity.BranchEntity
import app.worktrack.core.database.entity.EmployeeEntity
import app.worktrack.core.database.entity.GeofenceEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OrgDao {

    @Upsert
    suspend fun upsertBranches(branches: List<BranchEntity>)

    @Query("SELECT * FROM branches ORDER BY name")
    fun observeBranches(): Flow<List<BranchEntity>>

    @Upsert
    suspend fun upsertGeofences(geofences: List<GeofenceEntity>)

    @Query("SELECT * FROM geofences WHERE active = 1")
    fun observeActiveGeofences(): Flow<List<GeofenceEntity>>

    @Upsert
    suspend fun upsertEmployees(employees: List<EmployeeEntity>)

    @Query("SELECT * FROM employees WHERE id = :employeeId")
    fun observeEmployee(employeeId: String): Flow<EmployeeEntity?>

    @Query("DELETE FROM branches")
    suspend fun clearBranches()

    @Query("DELETE FROM geofences")
    suspend fun clearGeofences()

    @Query("DELETE FROM employees")
    suspend fun clearEmployees()
}
