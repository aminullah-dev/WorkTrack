import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { solarHolidaysFor } from "./calendar";
import { currentShamsiMonth } from "../lib/shamsi";

export const companySignupSchema = z.object({
  companyName: z.string().min(2).max(120),
  adminFirstName: z.string().min(1).max(80),
  adminLastName: z.string().min(1).max(80),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
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
 * Ordering matters. The login is created FIRST and every tenant document goes
 * in one atomic batch. Provisioning used to write the company, branch, shift,
 * employee and leave data one document at a time and create the login LAST, so
 * a duplicate email or a password Firebase rejected left a fully-formed company
 * that nobody could ever sign in to, and nothing cleaned it up. The old
 * getUserByEmail pre-check was also a race: two concurrent signups for the same
 * address both passed it, and the loser orphaned a company.
 *
 * The account stays gated until the address is verified — see the `sv` claim
 * and requireAuth. Rate limiting lives on the route.
 */
export async function provisionCompany(input: CompanySignup): Promise<SignupResult> {
  const auth = getAuth();

  const companyId = ulid();
  const employeeId = ulid();
  const branchId = ulid();
  const now = nowTimestamp();
  const joinDate = new Date().toISOString().slice(0, 10);
  const periodYear = new Date().getUTCFullYear();

  // Firebase is the authority on whether the address is free and the password
  // acceptable, so let it decide before anything else is written.
  await auth
    .createUser({
      uid: employeeId,
      email: input.email,
      password: input.password,
      displayName: `${input.adminFirstName} ${input.adminLastName}`.trim(),
      // Asserted by whoever filled in the form; proven only by the link that
      // Firebase mails to the address itself.
      emailVerified: false,
    })
    .catch((err: unknown) => {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-exists" || code === "auth/uid-already-exists") {
        throw new ApiError(409, ErrorCodes.CONFLICT, "An account with this email already exists");
      }
      if (code === "auth/invalid-password") {
        throw ApiError.validation("Password is too weak", {
          password: "Use at least 8 characters",
        });
      }
      throw err;
    });

  try {
    await auth.setCustomUserClaims(employeeId, {
      cid: companyId,
      eid: employeeId,
      r: ["COMPANY_ADMIN"],
      b: [branchId],
      // Self-signup: gated until the email address is verified. Accounts an
      // admin creates for staff never carry this, so they are unaffected.
      sv: true,
    });

    // One batch: either the whole workspace exists or none of it does.
    const batch = db.batch();

    // 1. Company (with default settings: all core modules on)
    batch.set(db.collection("companies").doc(companyId), {
      name: input.companyName,
      legalName: input.companyName,
      timezone: input.timezone,
      currency: input.currency,
      status: "ACTIVE",
      plan: "FREE",
      settings: {
        features: {
          shifts: true,
          leave: true,
          payroll: true,
          regularization: true,
          announcements: true,
          geofencing: true,
          qrKiosk: true,
          faceRecognition: false,
        },
        policies: {
          standardDailyMinutes: 480,
          weekendDays: [5],
          lateGraceMinutes: 10,
          overtimeEnabled: true,
        },
        profile: { currency: input.currency, timezone: input.timezone },
      },
      createdAt: now,
      updatedAt: now,
    });

    // A starter day shift so the roster works out of the box.
    batch.set(tenant(companyId, "shifts").doc("default-day"), {
      companyId,
      name: "شیفت روز",
      code: "DAY",
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: 60,
      graceInMinutes: 10,
      graceOutMinutes: 10,
      isNightShift: false,
      active: true,
      updatedAt: now,
    });

    // 2. Head-office branch (managers configure geofences/shifts on it later)
    batch.set(tenant(companyId, "branches").doc(branchId), {
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
    batch.set(tenant(companyId, "employees").doc(employeeId), {
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
      joinDate,
      status: "ACTIVE",
      updatedAt: now,
    });

    // 4. Default leave types so leave works out of the box
    const leaveTypes = [
      { id: "annual", name: "رخصتی سالانه", code: "ANNUAL", colorHex: "#2E7D32", entitled: 20 },
      { id: "sick", name: "رخصتی مریضی", code: "SICK", colorHex: "#B3261E", entitled: 10 },
    ];
    for (const lt of leaveTypes) {
      batch.set(tenant(companyId, "leaveTypes").doc(lt.id), {
        companyId,
        name: lt.name,
        code: lt.code,
        colorHex: lt.colorHex,
        isPaid: true,
        requiresAttachment: false,
        active: true,
        // The yearly grant lives on the type so every employee added later gets
        // the same entitlement without anyone re-entering it.
        defaultEntitlementDays: lt.entitled,
        updatedAt: now,
      });
      batch.set(tenant(companyId, "leaveBalances").doc(`${employeeId}_${lt.id}_${periodYear}`), {
        employeeId,
        leaveTypeId: lt.id,
        periodYear,
        entitledDays: lt.entitled,
        accruedDays: 0,
        usedDays: 0,
        carriedOverDays: 0,
        pendingDays: 0,
        updatedAt: now,
      });
    }

    // 5. A working calendar, so the first payroll run knows which days were
    // meant to be worked — without it every weekend and holiday reads as
    // absence. Only the Solar Hijri holidays are generated: Eid and the other
    // lunar dates are announced by moon sighting and are added from the portal.
    // Two years are seeded so a company signing up late is not left with an
    // empty calendar come Hamal.
    // periodYear above is the Gregorian year, which the leave balances are
    // keyed by; holidays are fixed in the Solar Hijri calendar and need its
    // year instead. Passing 2026 here would land the dates six centuries out.
    const shamsiYear = currentShamsiMonth().year;
    for (const year of [shamsiYear, shamsiYear + 1]) {
      for (const h of solarHolidaysFor(year)) {
        batch.set(tenant(companyId, "holidays").doc(h.date), { ...h, updatedAt: now });
      }
    }

    await batch.commit();
  } catch (err) {
    // The batch is all-or-nothing and nothing tenant-side is reachable without
    // the claims, so removing the login removes every trace of the attempt.
    await auth.deleteUser(employeeId).catch(() => undefined);
    throw err;
  }

  return { companyId, employeeId };
}
