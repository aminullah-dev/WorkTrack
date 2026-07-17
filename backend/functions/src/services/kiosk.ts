import { createHmac, timingSafeEqual } from "crypto";

/**
 * Kiosk QR tokens: `kioskId.slot.signature` where slot = floor(unixSeconds/30)
 * and signature = HMAC-SHA256(secret, `${kioskId}.${slot}`) hex. The kiosk app
 * regenerates the QR every 30 seconds; scanning a stale or forged code fails.
 */
export interface KioskToken {
  kioskId: string;
  slot: number;
}

export function signKioskToken(
  secret: string,
  kioskId: string,
  slot: number = currentSlot(),
): string {
  return `${kioskId}.${slot}.${signature(secret, kioskId, slot)}`;
}

/**
 * Verifies the token against the current slot ± 1 (90-second acceptance
 * window covers clock skew and scan latency). Returns null when invalid.
 */
export function verifyKioskToken(secret: string, token: string): KioskToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [kioskId, slotRaw, provided] = parts;
  const slot = Number.parseInt(slotRaw, 10);
  if (!kioskId || Number.isNaN(slot)) {
    return null;
  }

  const now = currentSlot();
  for (const candidate of [now, now - 1, now + 1]) {
    if (candidate !== slot) {
      continue;
    }
    const expected = signature(secret, kioskId, candidate);
    if (
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"))
    ) {
      return { kioskId, slot: candidate };
    }
  }
  return null;
}

function currentSlot(): number {
  return Math.floor(Date.now() / 1000 / 30);
}

function signature(secret: string, kioskId: string, slot: number): string {
  return createHmac("sha256", secret).update(`${kioskId}.${slot}`).digest("hex");
}
