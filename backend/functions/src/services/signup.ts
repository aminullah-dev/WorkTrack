import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";

export const companySignupSchema = z.object({
  companyName: z.string().min(2).max(120),
  adminFirstName: z.string().min(1).max(80),
  adminLastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  timezone: z.string().default("Asia/Kabul"),
  currency: z.string().length(3).default("AFN"),
});

export type CompanySignup = z.infer<typeof companySignupSchema>;

export interface SignupResult {
  companyId: string;
  employeeId: string;
}

/**
 * Provisions a brand-new tenant: a company, its head-office branch, the founding
 * COMPANY_ADMIN (both an employee record and a Firebase Auth user with tenant
 * claims), and sensible default leave types. This is the "each company gets its
 * own workspace" entry point.
 *
 * NOTE for production: gate this behind email verification and abuse controls
 * (rate limiting / captcha) before public launch — see docs/12.
 */
export async function provisionCompany(input: CompanySignup): Promise<SignupResult> {
  const auth = getAuth();

  // Reject if the email is already registered anywhere on the platform.
  const existing = await auth.getUserByEmail(input.email).catch(() => null);
  if (existing) {
    throw new ApiError(409, ErrorCodes.CONFLICT, "An account with this email already exists");
  }

  const companyId = ulid();
  const employeeId = ulid();
  const branchId = ulid();
  const now = nowTimestamp();

  // 1. Company
  await db.collection("companies").doc(companyId).set({
    name: input.companyName,
    legalName: input.companyName,
    timezone: input.timezone,
    currency: input.currency,
    status: "ACTIVE",
    plan: "FREE",
    createdAt: now,
    updatedAt: now,
  });

  // 2. Head-office branch (managers configure geofences/shifts on it later)
  await tenant(companyId, "branches").doc(branchId).set({
    companyId,
    name: "دفتر مرکزی",
    code: "HQ",
    address: null,
    latitude: null,
    longitude: null,
    radiusMeters: null,
    timezone: input.timezone,
    status: "ACTIVE",
    updatedAt: now,
  });

  // 3. Founding admin employee
  await tenant(companyId, "employees").doc(employeeId).set({
    companyId,
    employeeCode: "E-001",
    firstName: input.adminFirstName,
    lastName: input.adminLastName,
    email: input.email,
    phone: null,
    avatarUrl: null,
    branchId,
    departmentId: null,
    positionId: null,
    managerId: null,
    employmentType: "FULL_TIME",
    joinDate: new Date().toISOString().slice(0, 10),
    status: "ACTIVE",
    updatedAt: now,
  });

  // 4. Default leave types so leave works out of the box
  const leaveTypes = [
    { id: "annual", name: "رخصتی سالانه", code: "ANNUAL", colorHex: "#2E7D32", entitled: 20 },
    { id: "sick", name: "رخصتی مریضی", code: "SICK", colorHex: "#B3261E", entitled: 10 },
  ];
  for (const lt of leaveTypes) {
    await tenant(companyId, "leaveTypes").doc(lt.id).set({
      companyId,
      name: lt.name,
      code: lt.code,
      colorHex: lt.colorHex,
      isPaid: true,
      requiresAttachment: false,
      active: true,
      updatedAt: now,
    });
    await tenant(companyId, "leaveBalances").doc(`${employeeId}_${lt.id}_${new Date().getUTCFullYear()}`).set({
      employeeId,
      leaveTypeId: lt.id,
      periodYear: new Date().getUTCFullYear(),
      entitledDays: lt.entitled,
      accruedDays: 0,
      usedDays: 0,
      carriedOverDays: 0,
      pendingDays: 0,
      updatedAt: now,
    });
  }

  // 5. Firebase Auth user + tenant claims (this is what the token carries)
  await auth.createUser({
    uid: employeeId,
    email: input.email,
    password: input.password,
    displayName: `${input.adminFirstName} ${input.adminLastName}`.trim(),
  });
  await auth.setCustomUserClaims(employeeId, {
    cid: companyId,
    eid: employeeId,
    r: ["COMPANY_ADMIN"],
    b: [branchId],
  });

  return { companyId, employeeId };
}
