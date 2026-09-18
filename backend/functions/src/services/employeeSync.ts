import { getAuth } from "firebase-admin/auth";
import { ApiError, ErrorCodes } from "../lib/errors";
import { claimsFor, loginAllowedFor, type EmploymentStatus } from "./employeeAccount";

/**
 * Pushes an employee record onto the login it belongs to.
 *
 * uid == employeeId (see createEmployeeLogin), so there is exactly one account
 * per employee and no lookup is needed.
 *
 * Everything here exists because editing an employee used to write Firestore
 * and stop. The record and the account then disagreed silently, in four ways
 * that all look fine on screen:
 *
 *   - a changed email left the person signing in with the old one
 *   - a changed name left the old one on the account
 *   - a changed branch left the claims — which are what the server actually
 *     enforces — pointing at the branch they had been moved out of
 *   - EXITED changed a chip in a table while every permission stayed live
 */
export async function syncEmployeeLogin(params: {
  companyId: string;
  employeeId: string;
  email: string;
  displayName: string;
  role: string;
  branchId: string | null;
  status: EmploymentStatus;
}): Promise<{ changed: string[] }> {
  const auth = getAuth();

  // An employee created with createLogin: false has no account at all. That is
  // legitimate — a company can hold records for people who never touch the
  // app — so there is nothing to sync rather than something to fail on.
  const user = await auth.getUser(params.employeeId).catch(() => null);
  if (!user) return { changed: [] };

  const changed: string[] = [];
  const update: { email?: string; displayName?: string; disabled?: boolean } = {};

  if (params.email && params.email !== user.email) {
    update.email = params.email;
    changed.push("email");
  }
  if (params.displayName && params.displayName !== user.displayName) {
    update.displayName = params.displayName;
    changed.push("name");
  }

  const shouldBeDisabled = !loginAllowedFor(params.status);
  if (shouldBeDisabled !== user.disabled) {
    update.disabled = shouldBeDisabled;
    changed.push(shouldBeDisabled ? "access revoked" : "access restored");
  }

  if (Object.keys(update).length > 0) {
    try {
      await auth.updateUser(params.employeeId, update);
    } catch (error) {
      // The one failure a manager can actually cause and act on. Anything else
      // is ours and should surface as itself.
      if ((error as { code?: string }).code === "auth/email-already-exists") {
        throw new ApiError(
          409,
          ErrorCodes.CONFLICT,
          "Another account already uses this email address",
        );
      }
      throw error;
    }
  }

  const wanted = claimsFor(params);
  const current = (user.customClaims ?? {}) as Record<string, unknown>;
  const sameRole =
    Array.isArray(current.r) && current.r.length === 1 && current.r[0] === params.role;
  const sameBranch = JSON.stringify(current.b ?? []) === JSON.stringify(wanted.b);
  if (!sameRole || !sameBranch) {
    await auth.setCustomUserClaims(params.employeeId, wanted);
    if (!sameRole) changed.push("role");
    if (!sameBranch) changed.push("branch");
  }

  if (shouldBeDisabled || !sameRole || !sameBranch) {
    // Claims and the disabled flag both live in the token, and a token already
    // in a phone's memory keeps its old contents until it expires — up to an
    // hour. Revoking the refresh token is what bounds that: the app cannot
    // renew, so the old authority dies with the current token rather than
    // being quietly renewed all afternoon.
    //
    // It does NOT make the change instant. Somebody dismissed at 09:00 may
    // still punch at 09:40. Closing that window entirely means reading the
    // employee record on every single request, which is a cost worth deciding
    // on deliberately rather than smuggling in here.
    await auth.revokeRefreshTokens(params.employeeId);
  }

  return { changed };
}
