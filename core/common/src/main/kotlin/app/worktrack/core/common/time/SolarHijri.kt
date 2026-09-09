package app.worktrack.core.common.time

import java.time.LocalDate

/**
 * Solar Hijri (هجری شمسی) date — the official calendar of Afghanistan.
 * Month 1 is Hamal/حمل (vernal equinox, ~21 March).
 */
data class SolarHijriDate(val year: Int, val month: Int, val day: Int) {
    init {
        require(month in 1..12) { "month must be 1..12" }
        require(day in 1..31) { "day must be 1..31" }
    }

    fun toGregorian(): LocalDate = SolarHijri.toGregorian(this)

    /** Sortable "1405-04" style key for one month; used for paging state. */
    fun monthKey(): String = "%04d-%02d".format(year, month)
}

/**
 * Solar Hijri <-> Gregorian conversion using the arithmetic astronomical-cycle
 * algorithm from jalaali-js (Behrooz/Birashk break years), accurate for the
 * years this platform will ever process (1178–1633 AP / 1799–2254 AD).
 * Afghanistan shares the leap-year structure; only month names differ.
 */
object SolarHijri {

    private val BREAKS = intArrayOf(
        -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
        1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
    )

    fun fromGregorian(date: LocalDate): SolarHijriDate = d2j(g2d(date.year, date.monthValue, date.dayOfMonth))

    fun toGregorian(date: SolarHijriDate): LocalDate = d2g(j2d(date.year, date.month, date.day))

    fun today(timeProvider: TimeProvider): SolarHijriDate = fromGregorian(timeProvider.today())

    fun isLeapYear(year: Int): Boolean = jalCal(year).leap == 0

    fun monthLength(year: Int, month: Int): Int = when {
        month <= 6 -> 31
        month <= 11 -> 30
        else -> if (isLeapYear(year)) 30 else 29
    }

    /** First Gregorian day of a Solar Hijri month (for date-range queries). */
    fun monthStart(year: Int, month: Int): LocalDate = toGregorian(SolarHijriDate(year, month, 1))

    fun monthEnd(year: Int, month: Int): LocalDate =
        toGregorian(SolarHijriDate(year, month, monthLength(year, month)))

    // ------------------------------------------------------------ internals

    private data class JalCal(val leap: Int, val gy: Int, val march: Int)

    private fun jalCal(jy: Int): JalCal {
        require(jy in (BREAKS.first() + 1) until BREAKS.last()) { "year $jy out of supported range" }
        val gy = jy + 621
        var leapJ = -14
        var jp = BREAKS[0]

        var jump = 0
        for (i in 1 until BREAKS.size) {
            val jm = BREAKS[i]
            jump = jm - jp
            if (jy < jm) break
            leapJ += jump / 33 * 8 + jump % 33 / 4
            jp = jm
        }
        var n = jy - jp

        leapJ += n / 33 * 8 + (n % 33 + 3) / 4
        if (jump % 33 == 4 && jump - n == 4) leapJ += 1

        val leapG = gy / 4 - (gy / 100 + 1) * 3 / 4 - 150
        val march = 20 + leapJ - leapG

        if (jump - n < 6) n = n - jump + (jump + 4) / 33 * 33
        var leap = ((n + 1) % 33 - 1) % 4
        if (leap == -1) leap = 4

        return JalCal(leap = leap, gy = gy, march = march)
    }

    private fun g2d(gy: Int, gm: Int, gd: Int): Int {
        var d = (gy + (gm - 8) / 6 + 100100) * 1461 / 4 +
            (153 * ((gm + 9) % 12) + 2) / 5 + gd - 34840408
        d = d - (gy + 100100 + (gm - 8) / 6) / 100 * 3 / 4 + 752
        return d
    }

    private fun d2g(jdn: Int): LocalDate {
        var j = 4 * jdn + 139361631
        j += (4 * jdn + 183187720) / 146097 * 3 / 4 * 4 - 3908
        val i = j % 1461 / 4 * 5 + 308
        val gd = i % 153 / 5 + 1
        val gm = i / 153 % 12 + 1
        val gy = j / 1461 - 100100 + (8 - gm) / 6
        return LocalDate.of(gy, gm, gd)
    }

    private fun j2d(jy: Int, jm: Int, jd: Int): Int {
        val r = jalCal(jy)
        return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - jm / 7 * (jm - 7) + jd - 1
    }

    private fun d2j(jdn: Int): SolarHijriDate {
        val gy = d2g(jdn).year
        var jy = gy - 621
        val r = jalCal(jy)
        val jdn1f = g2d(gy, 3, r.march)
        var k = jdn - jdn1f

        if (k >= 0) {
            if (k <= 185) {
                return SolarHijriDate(jy, 1 + k / 31, k % 31 + 1)
            }
            k -= 186
        } else {
            jy -= 1
            k += 179
            if (r.leap == 1) k += 1
        }
        return SolarHijriDate(jy, 7 + k / 30, k % 30 + 1)
    }
}
