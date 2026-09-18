import { ASSIGNABLE_ROLES, type AssignableRole } from "./invite";

/**
 * The rules governing an employee's LOGIN, as opposed to their record.
 *
 * The two had drifted apart. Editing an employee wrote Firestore and never
 * touched Firebase Auth, so the record and the account it belongs to could
 * disagree without anything saying so: a changed email left the person signing
 * in with the old one, a changed branch left a manager reading the branch they
 * had been moved out of, and marking somebody EXITED changed a chip in a table
 * while they kept every permission they had the day before.
 *
 * These are the rules for closing that gap. They are pure so they can be
 * argued with in a test rather than discovered in production.
 */

export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "EXITED";

/**
 * Whether somebody with this employment status should still be able to sign in.
 *
 * ON_LEAVE is still employed: they need their payslip, and they need to file
 * the extension of the leave they are already on. SUSPENDED and EXITED are the
 * two that mean "this person should not be able to open the app any more" —
 * and today both of them still can, which is the point of this module.
 */
export function loginAllowedFor(status: EmploymentStatus): boolean {
  return status === "ACTIVE" || status === "ON_LEAVE";
}

function isAssignable(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/** Roles that hold the company itself, and are never granted through the API. */
function isOwnerLevel(roles: readonly string[]): boolean {
  return roles.some((r) => r === "COMPANY_ADMIN" || r === "SUPER_ADMIN");
}

/**
 * Why a role change must be refused, or null when it may proceed.
 *
 * Three things are being defended against, and only the first is obvious:
 *
 *   1. Minting authority that cannot be granted. COMPANY_ADMIN and SUPER_ADMIN
 *      are not in ASSIGNABLE_ROLES, so no request may produce one. Without
 *      this an HR admin could make themselves the owner in one call.
 *
 *   2. Taking the company from its owner. ASSIGNABLE_ROLES alone does not stop
 *      an HR admin from DEMOTING the COMPANY_ADMIN to EMPLOYEE — every role in
 *      that request is assignable, and afterwards the company has no owner and
 *      the HR admin is the most senior account left. So an actor may only
 *      change somebody whose current authority they could have granted.
 *
 *   3. Changing your own. Self-promotion is covered by (1), but self-demotion
 *      is its own hazard: the only COMPANY_ADMIN making themselves an EMPLOYEE
 *      locks the company out of its own settings with no way back that does not
 *      involve us. Roles are changed by somebody else, always.
 */
export function roleChangeRefusal(params: {
  actorEmployeeId: string;
  actorRoles: readonly string[];
  targetEmployeeId: string;
  targetCurrentRoles: readonly string[];
  newRole: string;
}): string | null {
  const { actorEmployeeId, actorRoles, targetEmployeeId, targetCurrentRoles, newRole } = params;

  if (actorEmployeeId === targetEmployeeId) {
    return "You cannot change your own role; ask another administrator";
  }

  if (!isAssignable(newRole)) {
    return `Role "${newRole}" cannot be assigned through the portal`;
  }

  if (isOwnerLevel(targetCurrentRoles) && !isOwnerLevel(actorRoles)) {
    return "Only a company administrator can change a company administrator's role";
  }

  return null;
}

/**
 * The claims an employee's login should carry, given the record as it now is.
 *
 * Kept next to the rules above because the claims ARE the authorisation: the
 * middleware reads `r` and `b` from the token and never opens the employee
 * document. A branch written to Firestore and not to the claims is a branch
 * the server does not enforce.
 */
export function claimsFor(params: {
  companyId: string;
  employeeId: string;
  role: string;
  branchId: string | null;
}): { cid: string; eid: string; r: string[]; b: string[] } {
  return {
    cid: params.companyId,
    eid: params.employeeId,
    r: [params.role],
    b: params.branchId ? [params.branchId] : [],
  };
}
