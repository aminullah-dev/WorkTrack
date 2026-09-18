import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { ApiError } from "../lib/errors";

/**
 * The vendor: Linumic staff, not any customer's employee.
 *
 * Everything else in this API takes the company id from the caller's token and
 * never from the request, which is what makes one customer unable to read
 * another's data. The vendor routes deliberately invert that — they take the
 * company id from the URL — so the identity behind them has to be one that no
 * customer can ever obtain. Two properties give that:
 *
 *   1. The `vendor` claim is set only by scripts/grant-vendor.ts, which needs
 *      credentials for the Firebase project itself. No signup, invite or
 *      employee route can write a custom claim at all, and the assignable-role
 *      list (services/invite.ts) contains no admin role of any kind.
 *
 *   2. A vendor account must carry NO tenant claims. An identity that is both
 *      would be a confused deputy: it could act on a company through the tenant
 *      routes while carrying cross-tenant authority. grant-vendor.ts refuses to
 *      create one and this middleware refuses to honour one.
 *
 * These routes are mounted outside requireAuth, which demands cid/eid — so a
 * vendor token is rejected by every tenant route, and a tenant token is
 * rejected here. The two identities cannot be used in each other's half of the
 * product, in either direction.
 */

export interface VendorContext {
  uid: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      vendor?: VendorContext;
    }
  }
}

export async function requireVendor(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header("Authorization") ?? "";
    const match = header.match(/^Bearer (.+)$/);
    if (!match) {
      throw ApiError.unauthenticated();
    }

    const decoded = await getAuth()
      .verifyIdToken(match[1])
      .catch(() => {
        throw ApiError.unauthenticated("Token is invalid or expired");
      });

    if (decoded.vendor !== true) {
      // Deliberately the same message a tenant user gets: whether this surface
      // exists is not something a customer's token should be able to probe.
      throw ApiError.permissionDenied("Not permitted");
    }

    // See (2) above. This is the check that keeps the inversion safe.
    if (decoded.cid || decoded.eid) {
      throw ApiError.permissionDenied("Not permitted");
    }

    // Staff sign in with a password like anyone else; an unverified address
    // must not carry cross-tenant authority.
    if (decoded.email_verified !== true) {
      throw ApiError.permissionDenied("Verify your email address first");
    }

    req.vendor = {
      uid: decoded.uid,
      email: (decoded.email as string | undefined) ?? null,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Non-null accessor for handlers running behind requireVendor. */
export function vendorOf(req: Request): VendorContext {
  const v = req.vendor;
  if (!v) {
    throw ApiError.unauthenticated();
  }
  return v;
}
