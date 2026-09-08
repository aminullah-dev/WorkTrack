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
 *  - List<String> -> one string joined on U+001F (the ASCII unit separator),
 *    a character that cannot occur in a name typed into the portal
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

    @TypeConverter
    fun stringListToString(value: List<String>?): String? = value?.joinToString(SEPARATOR)

    @TypeConverter
    // "".split(sep) yields [""], not [] — an empty list must round-trip empty
    // or a solo task would claim to have one nameless colleague on it.
    fun stringToStringList(value: String?): List<String>? =
        value?.let { if (it.isEmpty()) emptyList() else it.split(SEPARATOR) }

    private companion object {
        const val SEPARATOR = "\u001F"
    }
}
