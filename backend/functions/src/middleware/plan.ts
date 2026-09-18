import type { NextFunction, Request, Response } from "express";
import { ApiError, ErrorCodes } from "../lib/errors";
import { localDateOf } from "../services/attendance";
import { entitlementsOf, getLicense, licenseStanding } from "../services/license";
import type { Entitlements } from "../services/license";
import { getSettings } from "../services/settings";
import type { FeatureKey } from "../services/plans";
import { authOf } from "./auth";

/**
 * Enforces what the company's plan includes.
 *
 * Two guards, both of which do nothing at all unless `license.enforcePlan` is
 * on for that company — so every tenant that predates the plans, and every one
 * the vendor has chosen not to meter, is untouched.
 *
 *   enforcePlanState  a lapsed licence stops new records being written, and
 *                     nothing else. Reading, exporting and paying all still
 *                     work: a company locked out of its own attendance history
 *                     is a company that will never pay the invoice, and the
 *                     data is theirs regardless of what they owe.
 *   requireFeature    a capability the plan does not include is refused at the
 *                     router that owns it.
 *
 * The check asks for a capability, never for a tier. Tier names get renamed and
 * rebundled; `payroll` does not. See services/plans.ts.
 *
 * Lookups are cached in-process for a minute, as the device guard's are, so the
 * cost is about one read per company per minute per instance. An upgrade that
 * was just paid for therefore lands within a minute rather than instantly.
 */

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: { ent: Entitlements; lapsed: boolean };
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Exposed for tests, and called when a payment or the vendor rewrites a licence. */
export function clearPlanCache(cid?: string): void {
  if (cid) cache.delete(cid);
  else cache.clear();
}

async function planContext(cid: string): Promise<{ ent: Entitlements; lapsed: boolean }> {
  const hit = cache.get(cid);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.value;

  const license = await getLicense(cid);
  const ent = await entitlementsOf(license);
  // The company's own date: a licence must not lapse in Kabul because a server
  // in Iowa has already turned over to tomorrow.
  const settings = await getSettings(cid);
  const today = localDateOf(new Date(), settings.profile.timezone);
  const value = { ent, lapsed: licenseStanding(license, today).state === "LAPSED" };

  cache.set(cid, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Blocks writes for a company whose licence has lapsed past its grace window.
 *
 * Mounted after the routes a locked-out customer still needs — billing, support
 * and devices — so the way out of this state is always open.
 */
export async function enforcePlanState(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (READ_METHODS.has(req.method)) {
      next();
      return;
    }
    const auth = authOf(req);
    const { ent, lapsed } = await planContext(auth.companyId);
    if (!ent.enforced || !lapsed) {
      next();
      return;
    }
    throw new ApiError(
      403,
      ErrorCodes.PLAN_EXPIRED,
      "This company's plan has ended. Everything already recorded stays readable; renew the plan to record anything new.",
    );
  } catch (e) {
    next(e);
  }
}

/** Refuses a capability the company's plan does not include. */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = authOf(req);
      const { ent } = await planContext(auth.companyId);
      if (!ent.enforced || ent.features.includes(feature)) {
        next();
        return;
      }
      throw new ApiError(
        403,
        ErrorCodes.FEATURE_NOT_IN_PLAN,
        `The ${feature} module is not part of this company's plan. Upgrade the plan to use it.`,
        { feature },
      );
    } catch (e) {
      next(e);
    }
  };
}
