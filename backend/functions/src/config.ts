import { defineSecret, defineString } from "firebase-functions/params";

/** Where HesabPay's API lives, and the fallback when configuration says nothing. */
const HESAB_API_ROOT = "https://api.hesab.com/api/v1";

/**
 * HMAC secret for kiosk TOTP QR tokens. Managed via Secret Manager:
 *   firebase functions:secrets:set KIOSK_HMAC_SECRET
 * For the emulator, place a value in functions/.secret.local.
 */
export const kioskSecret = defineSecret("KIOSK_HMAC_SECRET");

/**
 * HesabPay merchant key, used to open a checkout session and to ask HesabPay to
 * verify a webhook signature. Server-side only — it must never reach the portal
 * or the apps:
 *   firebase functions:secrets:set HESAB_API_KEY
 *
 * Until it is set, the plans are visible and the licence still works; only
 * paying is refused, with a message saying payment is not configured.
 */
export const hesabApiKey = defineSecret("HESAB_API_KEY");

/** HesabPay's API root. A parameter so a sandbox can be pointed at instead. */
export const hesabBaseUrl = defineString("HESAB_BASE_URL", {
  default: HESAB_API_ROOT,
});

/**
 * The API root to actually call.
 *
 * A parameter's default only applies when nothing is set; an empty value in a
 * .env counts as a value, and the deploy prompt is one stray Return away from
 * writing one. An empty root would send every checkout and every signature
 * check to a relative URL — that is, refuse every payment — so it falls back
 * here rather than trusting the file.
 */
export function hesabBase(): string {
  return hesabBaseUrl.value().trim() || HESAB_API_ROOT;
}

/**
 * Another product that shares this HesabPay merchant account.
 *
 * HesabPay allows one active API key per account, and sends every callback for
 * it to one URL. That URL is this API, so callbacks for the other product
 * arrive here too; the ones that match no order of ours are handed on to it
 * rather than dropped. It verifies the signature itself, exactly as this does.
 *
 * Empty turns the hand-off off, which is what a deployment with an account of
 * its own should set.
 */
export const hesabForwardUrl = defineString("HESAB_FORWARD_URL", {
  default: "https://us-central1-safebeauty.cloudfunctions.net/hesabPayWebhook",
});

/**
 * Where HesabPay sends the browser back after checkout. The portal's own
 * origin; the payment is settled by the webhook, so these pages only report
 * what already happened.
 */
export const portalBaseUrl = defineString("PORTAL_BASE_URL", {
  default: "https://worktrack-prod.web.app",
});
