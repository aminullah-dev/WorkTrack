import { defineSecret } from "firebase-functions/params";

/**
 * HMAC secret for kiosk TOTP QR tokens. Managed via Secret Manager:
 *   firebase functions:secrets:set KIOSK_HMAC_SECRET
 * For the emulator, place a value in functions/.secret.local.
 */
export const kioskSecret = defineSecret("KIOSK_HMAC_SECRET");
