package app.worktrack.core.database.converter

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The string-list converter, which stores the names of the other people on a
 * task.
 *
 * The empty case is the one that matters: "".split(sep) yields [""], so a
 * careless round trip turns a solo job into one with a nameless colleague on
 * it, and the app then labels it team work.
 */
class ConvertersTest {

    private val converters = Converters()

    @Test
    fun `round-trips a list of names`() {
        val names = listOf("Ali Rahimi", "Omar Nazari", "فاطمه سادات")
        val stored = converters.stringListToString(names)
        assertEquals(names, converters.stringToStringList(stored))
    }

    @Test
    fun `an empty list comes back empty, not as one blank name`() {
        val stored = converters.stringListToString(emptyList())
        assertEquals(emptyList<String>(), converters.stringToStringList(stored))
    }

    @Test
    fun `one name stays one name`() {
        val stored = converters.stringListToString(listOf("Ali Rahimi"))
        assertEquals(listOf("Ali Rahimi"), converters.stringToStringList(stored))
    }

    @Test
    fun `null survives as null`() {
        assertNull(converters.stringListToString(null))
        assertNull(converters.stringToStringList(null))
    }

    @Test
    fun `a name containing spaces and commas is not split`() {
        // The separator is U+001F precisely so ordinary punctuation in a name
        // typed into the portal cannot break the row apart.
        val names = listOf("Sadat, Fatima", "Ali  Rahimi")
        val stored = converters.stringListToString(names)
        assertEquals(names, converters.stringToStringList(stored))
    }
}
