import { randomBytes } from "crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * ULID generator (Crockford base32, 48-bit time + 80-bit randomness) matching
 * the Android client's implementation. IDs sort by creation time.
 */
export function ulid(timestamp: number = Date.now()): string {
  const chars: string[] = new Array(26);

  let ts = timestamp;
  for (let i = 9; i >= 0; i--) {
    chars[i] = ENCODING[ts % 32];
    ts = Math.floor(ts / 32);
  }

  const rnd = randomBytes(10);
  let buffer = 0;
  let bitsInBuffer = 0;
  let out = 10;
  for (const byte of rnd) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      chars[out++] = ENCODING[(buffer >>> bitsInBuffer) & 0x1f];
    }
    // Keep the working buffer within 32-bit int range.
    buffer &= (1 << bitsInBuffer) - 1;
  }
  return chars.join("");
}

export function isValidUlid(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value.toUpperCase());
}
