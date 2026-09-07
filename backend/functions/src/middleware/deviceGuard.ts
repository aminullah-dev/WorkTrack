import type { NextFunction, Request, Response } from "express";
import { ApiError, ErrorCodes } from "../lib/errors";
import { tenant } from "../lib/firestore";
import { activateDevice, getLicense, isDeviceActive, licenseUsable } from "../services/license";
import { localDateOf } from "../services/attendance";
import { getSettings } from "../services/settings";
import { authOf } from "./auth";

/**
 * Enforces per-device licensing on requests from the mobile app and kiosks.
 *
 * Two deliberate limits on the blast radius:
 *
 *  - It only applies to companies that have turned `license.enforceDevices` on,
 *    which only the vendor can do.
 *  - It only applies to EMPLOYEE and KIOSK callers. Managers work in a browser,
 *    which is not a licensed device.
 *
 * It enrols rather than refuses. The app in the field already sends its device
 * id on every request (AuthInterceptor) but has no way to enrol it, so a guard
 * that demanded a pre-existing registration would lock out every phone of every
 * paying company the instant enforcement went on. Instead an unknown phone
 * claims a seat here, transactionally, and is refused only when the licence is
 * genuinely full. That is the limit the vendor sells; being unenrolled is not.
 * A kiosk is different: its login IS its device record, so an unknown kiosk was
 * revoked on purpose and stays refused.
 *
 * Lookups are cached in-process for a minute, so the hot path costs roughly one
 * read per device per minute per instance rather than one per request. The cost
 * is that a revoked device keeps working for up to that long.
 */

const CACHE_TTL_MS = 60_000;

/** Roles that run on a licensed device rather than in a manager's browser. */
const DEVICE_ROLES = new Set(["EMPLOYEE", "KIOSK"]);

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/** Exposed for tests, which must not inherit a previous case's cached state. */
export function clearDeviceGuardCache(): void {
  cache.clear();
}

export async function enforceDeviceLicense(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = authOf(req);
    if (!auth.roles.some((r) => DEVICE_ROLES.has(r))) {
      next();
      return;
    }

    const license = await cached(`lic:${auth.companyId}`, () => getLicense(auth.companyId));
    if (!license.enforceDevices) {
      next();
      return;
    }

    const settings = await cached(`set:${auth.companyId}`, () => getSettings(auth.companyId));
    const today = localDateOf(new Date(), settings.profile.timezone);
    if (!licenseUsable(license, today)) {
      throw new ApiError(
        403,
        ErrorCodes.LICENSE_INACTIVE,
        "This company's licence is not active",
      );
    }

    // A kiosk IS its device: createKioskAccount mints the login with
    // uid === kioskId === the device document id, so the seat is found from the
    // token alone. The kiosk runs in a browser and sends no X-Device-Id header,
    // so keying it off the header would refuse every kiosk on this planet.
    const isKiosk = auth.roles.includes("KIOSK");
    const deviceId = isKiosk ? auth.employeeId : req.header("X-Device-Id");

    if (!deviceId) {
      throw new ApiError(
        403,
        ErrorCodes.DEVICE_NOT_ACTIVATED,
        "This device is not activated. Sign in again to activate it.",
      );
    }

    const active = await cached(`dev:${auth.companyId}:${deviceId}`, async () => {
      const snap = await tenant(auth.companyId, "devices").doc(deviceId).get();
      return snap.exists && isDeviceActive(snap.data() as Record<string, unknown>);
    });

    if (active) {
      next();
      return;
    }

    // Not registered. A kiosk that reaches here was revoked deliberately, so it
    // stays refused. A phone, though, has simply never been seen: the app in the
    // field sends its id on every request but has no way to enrol it. Refusing
    // would lock out a company that is inside its seat count and has paid —
    // so claim the seat now, and refuse only when there is genuinely none left.
    if (isKiosk) {
      throw new ApiError(
        403,
        ErrorCodes.DEVICE_REVOKED,
        "This device is not activated for this company",
      );
    }

    // activateDevice does the seat count and the write in one transaction, so
    // two phones enrolling at once cannot both take the last seat. It throws
    // LICENSE_LIMIT_REACHED when the licence is full — which is the refusal the
    // customer should see, and the one the vendor is actually selling.
    await activateDevice(
      auth.companyId,
      auth.employeeId,
      {
        deviceId,
        platform: "ANDROID",
        model: req.header("X-Device-Model") ?? null,
        appVersion: req.header("X-App-Version") ?? null,
      },
      today,
    );
    // The negative answer above is now stale; without this the device stays
    // refused for up to a minute on this instance despite holding a seat.
    cache.delete(`dev:${auth.companyId}:${deviceId}`);

    next();
  } catch (err) {
    next(err);
  }
}
