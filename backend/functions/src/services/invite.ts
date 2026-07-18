import { getAuth } from "firebase-admin/auth";
import { randomBytes } from "crypto";
import { ApiError, ErrorCodes } from "../lib/errors";

/** Roles a manager can assign when onboarding an employee (not COMPANY_ADMIN). */
export const ASSIGNABLE_ROLES = [
  "EMPLOYEE",
  "TEAM_LEAD",
  "BRANCH_MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "AUDITOR",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * Human-shareable temporary password. Email-based invites are a P-next
 * enhancement (see docs/12); until then the manager shares this with the new
 * employee, who signs into the mobile app with it.
 */
export function generateTempPassword(): string {
  // e.g. "Wt-7Kd9Qp2r" — avoids ambiguous chars, always meets the 8-char rule.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(9);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `Wt-${out}`;
}

/**
 * Creates the Firebase Auth login for an employee and stamps their tenant/RBAC
 * claims. uid == employeeId so GET /me resolves the same document. Returns the
 * password that was set (caller shares it).
 */
export async function createEmployeeLogin(params: {
  companyId: string;
  employeeId: string;
  email: string;
  displayName: string;
  role: AssignableRole;
  branchIds: string[];
  password?: string;
}): Promise<string> {
  const auth = getAuth();

  const existing = await auth.getUserByEmail(params.email).catch(() => null);
  if (existing) {
    throw new ApiError(409, ErrorCodes.CONFLICT, "An account with this email already exists");
  }

  const password = params.password ?? generateTempPassword();
  await auth.createUser({
    uid: params.employeeId,
    email: params.email,
    password,
    displayName: params.displayName,
  });
  await auth.setCustomUserClaims(params.employeeId, {
    cid: params.companyId,
    eid: params.employeeId,
    r: [params.role],
    b: params.branchIds,
  });
  return password;
}

/** Resets an employee's login password to a fresh temporary one. */
export async function resetEmployeePassword(employeeId: string): Promise<string> {
  const auth = getAuth();
  const user = await auth.getUser(employeeId).catch(() => null);
  if (!user) {
    throw ApiError.notFound("This employee has no login account");
  }
  const password = generateTempPassword();
  await auth.updateUser(employeeId, { password });
  return password;
}
