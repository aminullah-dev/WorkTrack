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
    "kiosk:issue",
    "announcements:read",
    "announcements:write",
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
  BRANCH_MANAGER: new Set([
    "employees:read",
    "attendance:read",
    "attendance:approve",
    "leave:read",
    "leave:approve",
    "rosters:read",
    "rosters:write",
    "kiosk:issue",
    "announcements:read",
  ]),
  TEAM_LEAD: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "leave:approve",
    "rosters:read",
    "announcements:read",
  ]),
  EMPLOYEE: new Set([
    "self:punch",
    "self:attendance",
    "self:leave",
    "self:payslips",
    "announcements:read",
  ]),
  AUDITOR: new Set([
    "employees:read",
    "attendance:read",
    "leave:read",
    "payroll:read",
    "audit:read",
  ]),
  KIOSK: new Set(["kiosk:issue"]),
};

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
