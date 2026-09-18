import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors";
import { authOf } from "./auth";

/**
 * Permission catalog: role -> granted "resource:action" permissions.
 * "*" grants everything (company scope). Enforcement is deny-by-default.
 */
const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  SUPER_ADMIN: new Set(["*"]),
  COMPANY_ADMIN: new Set(["*"]),
  HR_ADMIN: new Set([
    "employees:read",
    "employees:write",
    "attendance:read",
    "attendance:write",
    "attendance:approve",
    "leave:read",
    "leave:write",
    "leave:approve",
    "payroll:read",
    "rosters:read",
    "rosters:write",
    "calendar:write",
    "kiosk:issue",
    "devices:read",
    "devices:manage",
    "announcements:read",
    "announcements:write",
    "work:read",
    "work:write",
    "self:tasks",
    "audit:read",
  ]),
  PAYROLL_ADMIN: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "payroll:read",
    "payroll:run",
    "payroll:approve",
  ]),
  // Dedicated finance & accounting admin: owns payroll, expenses, the general
  // ledger and financial reporting. Read-only on the HR context it reports on.
  FINANCE_ADMIN: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "payroll:read",
    "payroll:run",
    "payroll:approve",
    "finance:read",
    "expenses:read",
    "expenses:write",
    "expenses:approve",
    "ledger:read",
    "ledger:write",
    "audit:read",
  ]),
  BRANCH_MANAGER: new Set([
    "employees:read",
    "attendance:read",
    "attendance:approve",
    "leave:read",
    "leave:approve",
    "rosters:read",
    "rosters:write",
    "kiosk:issue",
    "devices:read",
    "announcements:read",
    "work:read",
    "work:write",
    "self:tasks",
  ]),
  // A team lead plans his own crew's day. This is the role the work-assignment
  // feature is for: he is the person who knows what the site needs tomorrow.
  TEAM_LEAD: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "leave:approve",
    "rosters:read",
    "announcements:read",
    "work:read",
    "work:write",
    "self:tasks",
  ]),
  EMPLOYEE: new Set([
    "self:punch",
    "self:attendance",
    "self:leave",
    "self:payslips",
    "announcements:read",
    // Read his own assignments and report progress on them. NOT work:read:
    // what the rest of the company is doing is not his to browse.
    "self:tasks",
  ]),
  AUDITOR: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "payroll:read",
    "work:read",
    "audit:read",
  ]),
  KIOSK: new Set(["kiosk:issue"]),
};

/**
 * Whether these roles may decide any pending request, not only the ones routed
 * to them. Mirrors the check inside decideLeaveRequest and decideRegularization
 * — the approvals queue and the decision must agree on who may act, or the
 * queue shows an empty list to somebody the server would happily let approve.
 */
export function canDecideAnyRequest(roles: string[]): boolean {
  return roles.includes("HR_ADMIN") || roles.includes("COMPANY_ADMIN") ||
    roles.includes("SUPER_ADMIN");
}

export function hasPermission(roles: string[], permission: string): boolean {
  return roles.some((role) => {
    const granted = ROLE_PERMISSIONS[role];
    return granted !== undefined && (granted.has("*") || granted.has(permission));
  });
}

/** Express guard: 403 unless one of the caller's roles grants [permission]. */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = authOf(req);
    if (!hasPermission(auth.roles, permission)) {
      next(ApiError.permissionDenied(`Requires ${permission}`));
      return;
    }
    next();
  };
}

/** True when the caller may approve leave (any approver-capable role). */
export function isApprover(roles: string[]): boolean {
  return hasPermission(roles, "leave:approve");
}
