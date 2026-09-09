import Foundation

/// A client-generated ULID: 10 characters of timestamp, 16 of randomness,
/// Crockford base32, 26 characters total.
///
/// The id is made HERE, not by the server, and that is the whole point: it is
/// what makes a punch idempotent. A phone that sends the same punch twice —
/// because the reply was lost, or the queue replayed — writes the same document
/// twice, which is once. The server validates the length at 26
/// (punchCreateSchema), and being time-ordered means punches sort by when they
/// happened even before anything parses a date out of them.
enum ULID {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    static func generate(at date: Date = Date()) -> String {
        var out = ""
        var ms = UInt64(date.timeIntervalSince1970 * 1000)

        // 10 characters of milliseconds, most significant first.
        var timeChars = [Character](repeating: "0", count: 10)
        for i in stride(from: 9, through: 0, by: -1) {
            timeChars[i] = alphabet[Int(ms % 32)]
            ms /= 32
        }
        out.append(contentsOf: timeChars)

        for _ in 0..<16 {
            out.append(alphabet[Int.random(in: 0..<32)])
        }
        return out
    }
}
