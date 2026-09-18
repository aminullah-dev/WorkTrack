import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { ApiError, ErrorCodes } from "../lib/errors";

/** Tenant/identity context resolved from verified Firebase custom claims. */
export interface AuthContext {
  uid: string;
  companyId: string;
  employeeId: string;
  roles: string[];
  branchIds: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Verifies the bearer ID token and loads tenant context from custom claims
 * ({ cid, eid, r, b }). Every /v1 route runs behind this — deny by default.
 */
export async function requireAuth(
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

    const decoded = await getAuth().verifyIdToken(match[1]).catch(() => {
      throw ApiError.unauthenticated("Token is invalid or expired");
    });

    const cid = decoded.cid as string | undefined;
    const eid = decoded.eid as string | undefined;
    if (!cid || !eid) {
      // An account without tenant claims is not provisioned as an employee.
      throw ApiError.permissionDenied("Account is not provisioned for any company");
    }

    // Self-signup company admins stay gated until they prove they own the
    // address they signed up with — otherwise anyone could stand up a workspace
    // under someone else's email. Accounts an admin creates for staff carry no
    // `sv` claim, and neither does any account that existed before this shipped,
    // so nobody in the field is affected.
    if (decoded.sv === true && decoded.email_verified !== true) {
      throw new ApiError(
        403,
        ErrorCodes.EMAIL_NOT_VERIFIED,
        "Verify your email address to finish setting up your company",
      );
    }

    req.auth = {
      uid: decoded.uid,
      companyId: cid,
      employeeId: eid,
      roles: Array.isArray(decoded.r) ? (decoded.r as string[]) : [],
      branchIds: Array.isArray(decoded.b) ? (decoded.b as string[]) : [],
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Non-null auth accessor for handlers running behind requireAuth. */
export function authOf(req: Request): AuthContext {
  const auth = req.auth;
  if (!auth) {
    throw ApiError.unauthenticated();
  }
  return auth;
}
