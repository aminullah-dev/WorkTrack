package app.worktrack.core.common.time

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SolarHijriTest {

    @Test
    fun `nawruz 1405 is 21 March 2026`() {
        assertEquals(
            SolarHijriDate(1405, 1, 1),
            SolarHijri.fromGregorian(LocalDate.of(2026, 3, 21)),
        )
        assertEquals(
            LocalDate.of(2026, 3, 21),
            SolarHijriDate(1405, 1, 1).toGregorian(),
        )
    }

    @Test
    fun `mid year conversion`() {
        // 17 July 2026 = 26 Saratan 1405
        assertEquals(
            SolarHijriDate(1405, 4, 26),
            SolarHijri.fromGregorian(LocalDate.of(2026, 7, 17)),
        )
    }

    @Test
    fun `epoch day converts`() {
        // 1 January 1970 = 11 Jadi 1348
        assertEquals(
            SolarHijriDate(1348, 10, 11),
            SolarHijri.fromGregorian(LocalDate.of(1970, 1, 1)),
        )
    }

    @Test
    fun `round trip across two full years`() {
        var date = LocalDate.of(2025, 3, 1)
        repeat(730) {
            val shamsi = SolarHijri.fromGregorian(date)
            assertEquals("round trip failed for $date", date, shamsi.toGregorian())
            date = date.plusDays(1)
        }
    }

    @Test
    fun `leap years`() {
        assertTrue(SolarHijri.isLeapYear(1403))
        assertFalse(SolarHijri.isLeapYear(1404))
        assertFalse(SolarHijri.isLeapYear(1405))
        assertEquals(30, SolarHijri.monthLength(1403, 12))
        assertEquals(29, SolarHijri.monthLength(1404, 12))
        assertEquals(31, SolarHijri.monthLength(1405, 6))
        assertEquals(30, SolarHijri.monthLength(1405, 7))
    }

    @Test
    fun `month boundaries`() {
        assertEquals(LocalDate.of(2026, 6, 22), SolarHijri.monthStart(1405, 4))
        assertEquals(LocalDate.of(2026, 7, 22), SolarHijri.monthEnd(1405, 4))
    }
}
