package app.worktrack.core.database.converter

import androidx.room.TypeConverter
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

/**
 * java.time storage strategy:
 *  - Instant   -> epoch millis (Long)   — range queries stay index-friendly
 *  - LocalDate -> epoch day (Long)      — timezone-proof calendar dates
 *  - LocalTime -> second of day (Int)   — shift boundaries
 * Enums are persisted by name via Room's built-in enum support.
 */
class Converters {

    @TypeConverter
    fun instantToLong(value: Instant?): Long? = value?.toEpochMilli()

    @TypeConverter
    fun longToInstant(value: Long?): Instant? = value?.let(Instant::ofEpochMilli)

    @TypeConverter
    fun localDateToLong(value: LocalDate?): Long? = value?.toEpochDay()

    @TypeConverter
    fun longToLocalDate(value: Long?): LocalDate? = value?.let(LocalDate::ofEpochDay)

    @TypeConverter
    fun localTimeToInt(value: LocalTime?): Int? = value?.toSecondOfDay()

    @TypeConverter
    // ofSecondOfDay takes a Long; Kotlin won't widen Int automatically.
    fun intToLocalTime(value: Int?): LocalTime? = value?.let { LocalTime.ofSecondOfDay(it.toLong()) }
}
