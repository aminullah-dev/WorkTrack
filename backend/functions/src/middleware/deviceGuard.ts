import type { NextFunction, Request, Response } from "express";
import { ApiError, ErrorCodes } from "../lib/errors";
import { tenant } from "../lib/firestore";
import { getLicense, isDeviceActive, licenseUsable } from "../services/license";
import { localDateOf } from "../services/attendance";
import { getSettings } from "../services/settings";
import { authOf } from "./auth";

/**
 * Enforces per-device licensing on requests from the mobile app and kiosks.
 *
 * Two deliberate limits on the blast radius:
 *
 *  - It only applies to companies that have turned `license.enforceDevices` on.
 *    The app builds already on employees' phones send no device id, so enabling
 *    this unconditionally would lock every existing user out on deploy. Roll the
 *    app update out first, then switch it on per company.
 *  - It only applies to EMPLOYEE and KIOSK callers. Managers work in a browser,
 *    which is not a licensed device.
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

    const deviceId = req.header("X-Device-Id");
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

    if (!active) {
      throw new ApiError(
        403,
        ErrorCodes.DEVICE_REVOKED,
        "This device is not activated for this company",
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
