import { createHmac, timingSafeEqual } from "crypto";

/**
 * Face-verification tokens bind a successful `/attendance/face/verify` result
 * to the punch that follows it.
 *
 * Without this the "verified" flag would be a client-set boolean: a tampered
 * app could claim `faceVerified` on a punch no camera ever saw. Instead the
 * server issues a signed, short-lived token on a real match, and only a punch
 * carrying a valid token is recorded as face-verified.
 *
 * Format: `employeeId.issuedAtMs.signature`. Pure crypto, no Firebase imports,
 * so it is unit-testable in isolation.
 */

/**
 * How long a verification stays usable. Generous enough to cover the capture →
 * outbox → push path on a slow link, short enough to bound token reuse.
 */
export const FACE_TOKEN_TTL_MS = 10 * 60 * 1000;

/** Tolerance for a client clock running ahead of the server. */
const MAX_FUTURE_SKEW_MS = 60 * 1000;

/**
 * Derives a face-token key from the shared HMAC secret. Domain separation
 * guarantees a kiosk token can never validate as a face token, and vice versa,
 * without provisioning a second secret.
 */
function faceKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("worktrack.face.v1").digest();
}

function signature(secret: string, employeeId: string, issuedAt: number): string {
  return createHmac("sha256", faceKey(secret))
    .update(`${employeeId}.${issuedAt}`)
    .digest("hex");
}

export function signFaceToken(
  secret: string,
  employeeId: string,
  issuedAt: number = Date.now(),
): string {
  return `${employeeId}.${issuedAt}.${signature(secret, employeeId, issuedAt)}`;
}

/**
 * True when [token] is an authentic, unexpired token issued for [employeeId].
 * Fails closed on every malformed input.
 */
export function verifyFaceToken(
  secret: string,
  employeeId: string,
  token: string,
  now: number = Date.now(),
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [tokenEmployeeId, issuedAtRaw, provided] = parts;
  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  if (!tokenEmployeeId || !provided || Number.isNaN(issuedAt)) {
    return false;
  }
  // A token issued for someone else must never verify this employee's punch.
  if (tokenEmployeeId !== employeeId) {
    return false;
  }
  if (issuedAt > now + MAX_FUTURE_SKEW_MS || now - issuedAt > FACE_TOKEN_TTL_MS) {
    return false;
  }
  const expected = signature(secret, tokenEmployeeId, issuedAt);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}
