import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes, asyncHandler } from "../lib/errors";
import { audit, db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { getAuth } from "firebase-admin/auth";
import { roleChangeRefusal, type EmploymentStatus } from "../services/employeeAccount";
import { syncEmployeeLogin } from "../services/employeeSync";
import { nextEmployeeCode } from "../services/employees";
import { clearFace } from "../services/face";
import {
  ASSIGNABLE_ROLES,
  createEmployeeLogin,
  resetEmployeePassword,
} from "../services/invite";

export const employeesRouter = Router();

interface EmployeeDoc {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  employmentType: string;
  joinDate: string;
  status: string;
  /**
   * A COPY of the role, for display and filtering only.
   *
   * The custom claim on the login is what the server enforces; nothing reads
   * this to decide anything. It exists because the portal could not show a
   * role at all otherwise — claims are not readable per row in a list — and a
   * role nobody can see is a role nobody can correct. Both are written in the
   * same handler, so they move together. Absent on employees created before
   * this shipped, which is why the portal treats absent as "unknown" rather
   * than as EMPLOYEE.
   */
  role?: string | null;
  faceEmbedding?: unknown;
  updatedAt: Timestamp;
}

function employeeToDto(id: string, companyId: string, doc: EmployeeDoc): Record<string, unknown> {
  return {
    id,
    companyId,
    employeeCode: doc.employeeCode,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    phone: doc.phone ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    branchId: doc.branchId ?? null,
    departmentId: doc.departmentId ?? null,
    positionId: doc.positionId ?? null,
    managerId: doc.managerId ?? null,
    role: doc.role ?? null,
    employmentType: doc.employmentType,
    joinDate: doc.joinDate,
    status: doc.status,
    faceEnrolled: Array.isArray(doc.faceEmbedding),
    updatedAt: toIso(doc.updatedAt),
  };
}

/**
 * Employee directory. Branch-scoped managers see only their branches; company/
 * HR admins see everyone. Cursor pagination on the document id (employeeCode
 * order would need a composite index; id order is stable and index-free).
 */
employeesRouter.get(
  "/",
  requirePermission("employees:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const branchFilter = req.query.branchId ? String(req.query.branchId) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;

    let query: Query = tenant(auth.companyId, "employees");

    // A branch manager is confined to the branches on their token claim.
    const companyWide =
      auth.roles.includes("COMPANY_ADMIN") ||
      auth.roles.includes("HR_ADMIN") ||
      auth.roles.includes("AUDITOR") ||
      auth.roles.includes("PAYROLL_ADMIN") ||
      auth.roles.includes("SUPER_ADMIN");

    const effectiveBranch = branchFilter ?? (!companyWide ? auth.branchIds[0] ?? null : null);
    if (effectiveBranch) {
      query = query.where("branchId", "==", effectiveBranch);
    }
    if (statusFilter) {
      query = query.where("status", "==", statusFilter);
    }

    query = query.orderBy("__name__").limit(limit);
    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map((doc) =>
      employeeToDto(doc.id, auth.companyId, doc.data() as EmployeeDoc),
    );
    const last = snapshot.docs[snapshot.docs.length - 1];

    res.json({
      data,
      meta: {
        cursor: snapshot.size === limit && last ? last.id : null,
        hasMore: snapshot.size === limit,
      },
    });
  }),
);

employeesRouter.get(
  "/:id",
  requirePermission("employees:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const doc = await tenant(auth.companyId, "employees").doc(req.params.id).get();
    if (!doc.exists) {
      throw ApiError.notFound("Employee not found");
    }
    res.json({ data: employeeToDto(doc.id, auth.companyId, doc.data() as EmployeeDoc) });
  }),
);

const employeeWriteSchema = z.object({
  // Optional, and generated when it is left out — see services/employees.ts.
  // On an edit, leaving it out keeps the code the employee already has; a
  // full set() would otherwise blank it, and this schema serves both routes.
  employeeCode: z.string().min(1).max(40).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(40).nullish(),
  branchId: z.string().nullish(),
  departmentId: z.string().nullish(),
  positionId: z.string().nullish(),
  managerId: z.string().nullish(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"]).default("ACTIVE"),
  // Login provisioning (create only): give the new employee a mobile-app login.
  // No default. A default here is indistinguishable from a deliberate choice
  // once it reaches the handler, and the update path reads it as one: an edit
  // to somebody's phone number would have demoted a team lead to EMPLOYEE
  // without anybody asking for it. Create supplies the default itself.
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  createLogin: z.boolean().default(true),
  initialPassword: z.string().min(8).max(100).optional(),
});

function toDoc(
  payload: z.infer<typeof employeeWriteSchema>,
  avatarUrl: string | null,
  employeeCode: string,
  role: string | null,
): EmployeeDoc {
  return {
    employeeCode,
    role,
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    phone: payload.phone ?? null,
    branchId: payload.branchId ?? null,
    departmentId: payload.departmentId ?? null,
    positionId: payload.positionId ?? null,
    managerId: payload.managerId ?? null,
    employmentType: payload.employmentType,
    joinDate: payload.joinDate,
    status: payload.status,
    avatarUrl,
    updatedAt: nowTimestamp(),
  };
}

employeesRouter.post(
  "/",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, employeeWriteSchema);
    const id = ulid();
    const employees = tenant(auth.companyId, "employees");

    // Create the login FIRST so a duplicate-email failure doesn't leave an
    // orphaned employee record behind.
    let tempPassword: string | null = null;
    if (payload.createLogin) {
      tempPassword = await createEmployeeLogin({
        companyId: auth.companyId,
        employeeId: id,
        email: payload.email,
        displayName: `${payload.firstName} ${payload.lastName}`.trim(),
        role: payload.role ?? "EMPLOYEE",
        branchIds: payload.branchId ? [payload.branchId] : [],
        password: payload.initialPassword,
      });
    }

    // Reading the codes and writing the new one in one transaction. Two
    // administrators adding somebody in the same moment would otherwise both
    // read the same highest code and both be handed it: nothing enforces
    // uniqueness on a display code, so the collision would be silent and
    // permanent, and payroll would have two people answering to E-014.
    const doc = await db.runTransaction(async (tx) => {
      let code = payload.employeeCode?.trim();
      if (!code) {
        const snap = await tx.get(employees.select("employeeCode"));
        code = nextEmployeeCode(snap.docs.map((d) => d.get("employeeCode") as string));
      }
      const created = toDoc(payload, null, code, payload.role ?? "EMPLOYEE");
      tx.create(employees.doc(id), created);
      return created;
    });
    await seedLeaveBalances(auth.companyId, id);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "employees.create",
      resourceType: "employees",
      resourceId: id,
      after: { employeeCode: doc.employeeCode, email: payload.email, role: payload.role },
    });
    res.status(201).json({
      data: { ...employeeToDto(id, auth.companyId, doc), tempPassword },
    });
  }),
);

const resetPasswordSchema = z.object({
  // Optional: a manager-chosen permanent password; omitted → random temp one.
  password: z.string().min(8).max(100).optional(),
});

/** Set an employee's login password — a manager-chosen one, or a random temp. */
employeesRouter.post(
  "/:id/reset-password",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { password } = parseBody(req, resetPasswordSchema);
    const emp = await tenant(auth.companyId, "employees").doc(req.params.id).get();
    if (!emp.exists) {
      throw ApiError.notFound("Employee not found");
    }
    const tempPassword = await resetEmployeePassword(req.params.id, password);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "employees.reset_password",
      resourceType: "employees",
      resourceId: req.params.id,
    });
    res.json({ data: { tempPassword } });
  }),
);

employeesRouter.put(
  "/:id",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, employeeWriteSchema);
    const ref = tenant(auth.companyId, "employees").doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists) {
      throw ApiError.notFound("Employee not found");
    }
    const existingDoc = existing.data() as EmployeeDoc & { faceEnrolledAt?: unknown };
    // Omitting the code on an edit means "leave it alone", not "clear it".
    const doc = toDoc(
      payload,
      existingDoc.avatarUrl ?? null,
      payload.employeeCode?.trim() || existingDoc.employeeCode,
      // Filled in below once the role change has been allowed; an edit that
      // does not mention a role must not disturb the one on record.
      existingDoc.role ?? null,
    );

    // The login this record belongs to. Everything below decides what may
    // change about it; syncEmployeeLogin then makes it so, because a record
    // that disagrees with its own account is worse than one that cannot be
    // edited at all — it looks like it worked.
    const account = await getAuth().getUser(req.params.id).catch(() => null);
    const currentRoles = (account?.customClaims?.r as string[] | undefined) ?? [];
    // Omitting the role means "leave it alone", the same as the code.
    const nextRole = payload.role && payload.role !== currentRoles[0] ? payload.role : null;

    if (nextRole) {
      const refusal = roleChangeRefusal({
        actorEmployeeId: auth.employeeId,
        actorRoles: auth.roles,
        targetEmployeeId: req.params.id,
        targetCurrentRoles: currentRoles,
        newRole: nextRole,
      });
      if (refusal) {
        throw new ApiError(403, ErrorCodes.PERMISSION_DENIED, refusal);
      }
    }
    // A full set() would otherwise wipe face enrollment; carry it across edits.
    const preserved: Record<string, unknown> = { ...doc };
    if (existingDoc.faceEmbedding !== undefined) preserved.faceEmbedding = existingDoc.faceEmbedding;
    if (existingDoc.faceEnrolledAt !== undefined) preserved.faceEnrolledAt = existingDoc.faceEnrolledAt;
    // Auth first, Firestore second — the same order the create path uses, and
    // for the same reason: an email already taken by somebody else must fail
    // before the record moves, not after.
    const sync = await syncEmployeeLogin({
      companyId: auth.companyId,
      employeeId: req.params.id,
      email: doc.email,
      displayName: `${doc.firstName} ${doc.lastName}`.trim(),
      role: nextRole ?? currentRoles[0] ?? "EMPLOYEE",
      branchId: doc.branchId ?? null,
      status: doc.status as EmploymentStatus,
    });
    // After the sync, not before: until Auth has accepted the change there is
    // nothing to record. `preserved` was spread from `doc` further up, so both
    // have to be told.
    if (nextRole) {
      doc.role = nextRole;
      preserved.role = nextRole;
    }

    await ref.set(preserved);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      // Role and access changes are the ones somebody will need to account for
      // later, so they are named rather than buried in a document diff.
      action: sync.changed.length
        ? `employees.update (${sync.changed.join(", ")})`
        : "employees.update",
      resourceType: "employees",
      resourceId: req.params.id,
      before: employeeToDto(req.params.id, auth.companyId, existing.data() as EmployeeDoc),
      after: employeeToDto(req.params.id, auth.companyId, doc),
    });
    res.json({ data: employeeToDto(req.params.id, auth.companyId, doc) });
  }),
);

/** Admin: clear an employee's face enrollment (e.g. re-enroll after a bad capture). */
employeesRouter.delete(
  "/:id/face",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const ref = tenant(auth.companyId, "employees").doc(req.params.id);
    if (!(await ref.get()).exists) {
      throw ApiError.notFound("Employee not found");
    }
    await clearFace(auth.companyId, req.params.id);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "employees.face.reset",
      resourceType: "employees",
      resourceId: req.params.id,
    });
    res.json({ data: { faceEnrolled: false } });
  }),
);

/**
 * Gives a new employee an entitlement row for every active leave type.
 *
 * Only the signup flow ever created these, so everyone added through the portal
 * had no balance at all. Leave now refuses a request with no entitlement, which
 * would strand them — so the rows are created up front, at the leave type's
 * default. A zero-entitlement type still gets a row, so the refusal that
 * follows is a deliberate "none granted" rather than "nothing configured".
 */
async function seedLeaveBalances(cid: string, employeeId: string): Promise<void> {
  const typesSnap = await tenant(cid, "leaveTypes").get();
  if (typesSnap.empty) return;

  const periodYear = new Date().getUTCFullYear();
  const now = nowTimestamp();
  const batch = db.batch();
  for (const typeDoc of typesSnap.docs) {
    const type = typeDoc.data() as { defaultEntitlementDays?: number; active?: boolean };
    if (type.active === false) continue;

    // Tenants created before the type carried a default still have balances on
    // their existing staff — mirror one rather than granting nobody anything.
    let entitledDays = type.defaultEntitlementDays;
    if (entitledDays === undefined) {
      const peer = await tenant(cid, "leaveBalances")
        .where("leaveTypeId", "==", typeDoc.id)
        .limit(1)
        .get();
      entitledDays = peer.empty
        ? 0
        : ((peer.docs[0].data().entitledDays as number | undefined) ?? 0);
    }

    batch.set(
      tenant(cid, "leaveBalances").doc(`${employeeId}_${typeDoc.id}_${periodYear}`),
      {
        employeeId,
        leaveTypeId: typeDoc.id,
        periodYear,
        entitledDays,
        accruedDays: 0,
        usedDays: 0,
        carriedOverDays: 0,
        pendingDays: 0,
        updatedAt: now,
      },
      { merge: true },
    );
  }
  await batch.commit();
}
