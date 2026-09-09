package app.worktrack.core.network.dto

import app.worktrack.core.network.serializer.InstantSerializer
import java.time.Instant
import kotlinx.serialization.Serializable

@Serializable
data class ProjectDto(
    val id: String,
    val name: String,
    val code: String,
    val status: String = "ACTIVE",
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class WorkTaskDto(
    val id: String,
    val projectId: String,
    val projectName: String = "",
    val title: String,
    val detail: String? = null,
    val location: String? = null,
    /** Plain calendar dates (YYYY-MM-DD); a task is scheduled, not timestamped. */
    val startDate: String,
    val endDate: String,
    val status: String = "PLANNED",
    val priority: String = "NORMAL",
    val teamName: String? = null,
    val assigneeNames: List<String> = emptyList(),
    @Serializable(InstantSerializer::class) val updatedAt: Instant,
)

@Serializable
data class WorkDayDto(
    val date: String,
    val kind: String = "WORKING",
    val tasks: List<WorkTaskDto> = emptyList(),
)

@Serializable
data class MyWorkDto(
    val today: WorkDayDto,
    val next: WorkDayDto? = null,
)

/** Reporting progress on your own work. */
@Serializable
data class TaskStatusDto(
    val status: String,
    val note: String? = null,
)
