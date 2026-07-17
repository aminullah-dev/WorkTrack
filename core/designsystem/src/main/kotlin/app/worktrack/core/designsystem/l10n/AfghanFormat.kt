package app.worktrack.core.designsystem.l10n

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringArrayResource
import app.worktrack.core.common.time.SolarHijri
import app.worktrack.core.common.time.SolarHijriDate
import app.worktrack.core.designsystem.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Afghanistan-first formatting: Solar Hijri dates with Afghan month names and
 * Extended Arabic-Indic digits (۰–۹) for Dari and Pashto locales. English
 * shows the same Solar Hijri dates with transliterated month names — the
 * business calendar of the platform is Solar Hijri regardless of language.
 */
object AfghanDigits {

    private val EASTERN = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')

    fun usesEasternDigits(locale: Locale): Boolean =
        locale.language == "fa" || locale.language == "ps"

    fun localize(input: String, locale: Locale): String {
        if (!usesEasternDigits(locale)) return input
        val out = StringBuilder(input.length)
        for (ch in input) {
            out.append(if (ch in '0'..'9') EASTERN[ch - '0'] else ch)
        }
        return out.toString()
    }
}

@Composable
fun appLocale(): Locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()

/** Converts any Latin digits in [text] to ۰–۹ for Dari/Pashto locales. */
@Composable
fun localizedDigits(text: String): String = AfghanDigits.localize(text, appLocale())

@Composable
fun shamsiMonthName(month: Int): String =
    stringArrayResource(R.array.ds_shamsi_months)[(month - 1).coerceIn(0, 11)]

@Composable
fun weekdayName(date: LocalDate): String =
    stringArrayResource(R.array.ds_weekdays)[date.dayOfWeek.value - 1]

/** "پنجشنبه ۲۶ سرطان" (withWeekday) or "۲۶ سرطان ۱۴۰۵" (withYear). */
@Composable
fun formatShamsiDate(
    date: LocalDate,
    withWeekday: Boolean = false,
    withYear: Boolean = false,
): String {
    val shamsi = SolarHijri.fromGregorian(date)
    val base = buildString {
        if (withWeekday) {
            append(weekdayName(date))
            append(' ')
        }
        append(shamsi.day)
        append(' ')
        append(shamsiMonthName(shamsi.month))
        if (withYear) {
            append(' ')
            append(shamsi.year)
        }
    }
    return localizedDigits(base)
}

/** "سرطان ۱۴۰۵" — month header labels. */
@Composable
fun formatShamsiMonthYear(year: Int, month: Int): String =
    localizedDigits("${shamsiMonthName(month)} $year")

/** "۲۶ سرطان – ۲ اسد" — leave/date ranges (en-dash keeps RTL ordering intact). */
@Composable
fun formatShamsiRange(start: LocalDate, end: LocalDate): String {
    val s = SolarHijri.fromGregorian(start)
    val e = SolarHijri.fromGregorian(end)
    val text = if (s.year == e.year && s.month == e.month && s.day == e.day) {
        "${s.day} ${shamsiMonthName(s.month)} ${s.year}"
    } else {
        "${s.day} ${shamsiMonthName(s.month)} – ${e.day} ${shamsiMonthName(e.month)} ${e.year}"
    }
    return localizedDigits(text)
}

private val TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm")

/** Wall-clock time in the device zone, digits localized. */
@Composable
fun formatClockTime(instant: Instant): String =
    localizedDigits(TIME_FORMAT.format(instant.atZone(ZoneId.systemDefault())))

/** "۲۶ سرطان ۱۴:۳۰" — compact timestamp for sync status rows. */
@Composable
fun formatShamsiDateTime(instant: Instant): String {
    val zoned = instant.atZone(ZoneId.systemDefault())
    val shamsi = SolarHijri.fromGregorian(zoned.toLocalDate())
    return localizedDigits(
        "${shamsi.day} ${shamsiMonthName(shamsi.month)} ${TIME_FORMAT.format(zoned)}",
    )
}

/** Current Solar Hijri date for "today" defaults in pickers/pagers. */
fun shamsiToday(): SolarHijriDate = SolarHijri.fromGregorian(LocalDate.now())
