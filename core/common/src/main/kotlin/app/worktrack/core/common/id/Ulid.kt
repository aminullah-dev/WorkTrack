package app.worktrack.core.common.id

import java.security.SecureRandom

/**
 * ULID generator (26-char Crockford base32: 48-bit timestamp + 80-bit randomness).
 *
 * ULIDs are the platform-wide ID scheme because they are generatable offline
 * (no server round-trip), lexicographically sortable by creation time (index
 * friendly in both Room and Firestore), and collision-safe across devices.
 */
object Ulid {

    private const val ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private const val TIME_CHARS = 10
    private const val RANDOM_BYTES = 10 // 80 bits -> 16 base32 chars

    private val random = SecureRandom()

    fun generate(timestampMillis: Long = System.currentTimeMillis()): String {
        require(timestampMillis >= 0) { "timestamp must be non-negative" }
        val chars = CharArray(26)

        var ts = timestampMillis
        for (i in TIME_CHARS - 1 downTo 0) {
            chars[i] = ENCODING[(ts and 0x1F).toInt()]
            ts = ts ushr 5
        }

        val rnd = ByteArray(RANDOM_BYTES)
        random.nextBytes(rnd)
        var buffer = 0L
        var bitsInBuffer = 0
        var out = TIME_CHARS
        for (b in rnd) {
            buffer = (buffer shl 8) or (b.toLong() and 0xFF)
            bitsInBuffer += 8
            while (bitsInBuffer >= 5) {
                bitsInBuffer -= 5
                chars[out++] = ENCODING[((buffer ushr bitsInBuffer) and 0x1F).toInt()]
            }
        }
        return String(chars)
    }

    fun isValid(value: String): Boolean =
        value.length == 26 && value.all { ENCODING.indexOf(it.uppercaseChar()) >= 0 }
}
