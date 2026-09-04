package app.worktrack.core.common.id

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UlidTest {

    @Test
    fun `generates 26 char crockford base32`() {
        val ulid = Ulid.generate()
        assertEquals(26, ulid.length)
        assertTrue(Ulid.isValid(ulid))
    }

    @Test
    fun `is lexicographically sortable by timestamp`() {
        val earlier = Ulid.generate(timestampMillis = 1_000_000L)
        val later = Ulid.generate(timestampMillis = 2_000_000L)
        assertTrue(earlier < later)
    }

    @Test
    fun `encodes identical timestamps with identical prefix`() {
        val a = Ulid.generate(timestampMillis = 1_700_000_000_000)
        val b = Ulid.generate(timestampMillis = 1_700_000_000_000)
        assertEquals(a.take(10), b.take(10))
    }

    @Test
    fun `no collisions across a large batch`() {
        val batch = (1..10_000).map { Ulid.generate() }.toSet()
        assertEquals(10_000, batch.size)
    }
}
