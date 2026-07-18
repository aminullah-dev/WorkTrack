import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, asyncHandler } from "../lib/errors";
import { audit, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";

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
    employmentType: doc.employmentType,
    joinDate: doc.joinDate,
    status: doc.status,
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
  employeeCode: z.string().min(1).max(40),
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
});

employeesRouter.post(
  "/",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, employeeWriteSchema);
    const id = ulid();
    const doc: EmployeeDoc = {
      ...payload,
      phone: payload.phone ?? null,
      branchId: payload.branchId ?? null,
      departmentId: payload.departmentId ?? null,
      positionId: payload.positionId ?? null,
      managerId: payload.managerId ?? null,
      avatarUrl: null,
      updatedAt: nowTimestamp(),
    };
    await tenant(auth.companyId, "employees").doc(id).create(doc);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "employees.create",
      resourceType: "employees",
      resourceId: id,
      after: { employeeCode: payload.employeeCode, email: payload.email },
    });
    res.status(201).json({ data: employeeToDto(id, auth.companyId, doc) });
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
    const doc: EmployeeDoc = {
      ...payload,
      phone: payload.phone ?? null,
      branchId: payload.branchId ?? null,
      departmentId: payload.departmentId ?? null,
      positionId: payload.positionId ?? null,
      managerId: payload.managerId ?? null,
      avatarUrl: (existing.data() as EmployeeDoc).avatarUrl ?? null,
      updatedAt: nowTimestamp(),
    };
    await ref.set(doc);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "employees.update",
      resourceType: "employees",
      resourceId: req.params.id,
      before: employeeToDto(req.params.id, auth.companyId, existing.data() as EmployeeDoc),
      after: employeeToDto(req.params.id, auth.companyId, doc),
    });
    res.json({ data: employeeToDto(req.params.id, auth.companyId, doc) });
  }),
);
