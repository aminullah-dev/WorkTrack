import { Router } from "express";
import {
  assignmentId,
  assignmentWriteSchema,
  clearAssignment,
  listAssignmentsFor,
  setAssignment,
} from "../services/salaryAssignments";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes, asyncHandler } from "../lib/errors";
import { audit, db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { withIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import { ulid } from "../lib/ids";
import { computePayrollRun } from "../services/payroll";
import { getSettings } from "../services/settings";

export const payrollRouter = Router();

/** Payroll runs for this company, newest first. */
payrollRouter.get(
  "/runs",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snapshot = await tenant(auth.companyId, "payrollRuns").get();
    const runs = snapshot.docs
      .map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          periodYear: (d.periodYear as number) ?? 0,
          periodMonth: (d.periodMonth as number) ?? 0,
          status: (d.status as string) ?? "APPROVED",
          currency: (d.currency as string) ?? "AFN",
          payslipCount: (d.payslipCount as number) ?? 0,
          totalGross: (d.totalGross as number) ?? 0,
          totalNet: (d.totalNet as number) ?? 0,
          totalTax: (d.totalTax as number) ?? 0,
          totalEmployerCost: (d.totalEmployerCost as number) ?? 0,
          // Runs written before this field existed were all whole months.
          periodComplete: (d.periodComplete as boolean | undefined) ?? true,
          lockedAt: toIso((d.lockedAt as Timestamp | null | undefined) ?? null),
          createdAt: toIso((d.createdAt as Timestamp | null | undefined) ?? null),
        };
      })
      .sort((a, b) => b.periodYear * 100 + b.periodMonth - (a.periodYear * 100 + a.periodMonth));
    res.json({ data: runs });
  }),
);

const runCreateSchema = z.object({
  periodYear: z.number().int().min(1300).max(1500),
  periodMonth: z.number().int().min(1).max(12),
});

/** Run (compute) payroll for a Solar Hijri month. Idempotent per period. */
payrollRouter.post(
  "/runs",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { periodYear, periodMonth } = parseBody(req, runCreateSchema);

    const { result, replayed } = await withIdempotency(
      auth.companyId,
      req.header("Idempotency-Key"),
      async () => {
        const companySnap = await db.collection("companies").doc(auth.companyId).get();
        const currency = (companySnap.data()?.currency as string | undefined) ?? "AFN";

        return computePayrollRun(
          auth.companyId,
          periodYear,
          periodMonth,
          auth.employeeId,
          currency,
        );
      },
    );

    res.status(replayed ? 200 : 201).json({ data: result });
  }),
);

/** Payslips generated in a run (manager view across employees). */
payrollRouter.get(
  "/runs/:runId/payslips",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const runSnap = await tenant(auth.companyId, "payrollRuns").doc(req.params.runId).get();
    if (!runSnap.exists) {
      throw ApiError.notFound("Payroll run not found");
    }
    const snapshot = await tenant(auth.companyId, "payslips")
      .where("runId", "==", req.params.runId)
      .get();

    // Join employee names for the table (small runs; batched in prod).
    const rows = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const d = doc.data() as Record<string, unknown>;
        const empSnap = await tenant(auth.companyId, "employees")
          .doc(d.employeeId as string)
          .get();
        const emp = empSnap.data() as
          | { firstName?: string; lastName?: string; employeeCode?: string }
          | undefined;
        return {
          id: doc.id,
          employeeId: d.employeeId,
          // The printed payment sheet is keyed by the code, not the name: two
          // people called احمد in one company is the ordinary case, and a sheet
          // somebody signs has to be unambiguous about who signed which line.
          employeeCode: emp?.employeeCode ?? "",
          employeeName: emp ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : d.employeeId,
          currency: d.currency,
          gross: d.gross,
          totalDeductions: d.totalDeductions,
          net: d.net,
          incomeTax: d.incomeTax ?? 0,
          employerCost: d.employerCost ?? 0,
          costToCompany: d.costToCompany ?? d.gross,
          workedDays: d.workedDays,
          lopDays: d.lopDays,
          status: d.status,
        };
      }),
    );
    rows.sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));
    res.json({ data: { runId: req.params.runId, payslips: rows } });
  }),
);

// ------------------------------------------------------ salary configuration

/*
 * Payroll reads employeeSalaries and salaryComponents, and until now nothing
 * could write either: the demo seed was their only author. On a company that
 * signed up for itself, every run returned 200 with payslipCount 0 because
 * `computePayrollRun` skips an employee with no salary on file. These are the
 * missing halves.
 *
 * Compensation sits with whoever runs payroll: reading needs payroll:read,
 * writing needs payroll:run. A COMPANY_ADMIN holds both through the wildcard.
 */

const salarySchema = z.object({
  /**
   * The rate. What it is a rate FOR depends on payModel: a monthly salary, a
   * day's wage, or the price of one piece. One field rather than three, so
   * there is nothing to keep consistent — see services/payModels.ts.
   */
  basicAmount: z.number().min(0).max(100_000_000),
  // Optional so every existing client keeps working; absent means MONTHLY,
  // which is what every company on file today is.
  payModel: z.enum(["MONTHLY", "DAILY", "PIECE"]).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  revisionReason: z.string().max(200).nullish(),
});

/** The employee's current basic salary, or null when none is on file yet. */
payrollRouter.get(
  "/employees/:id/salary",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snap = await tenant(auth.companyId, "employeeSalaries").doc(req.params.id).get();
    if (!snap.exists) {
      res.json({ data: null });
      return;
    }
    const d = snap.data() as {
      basicAmount?: number;
      payModel?: string;
      currency?: string;
      effectiveFrom?: string;
      revisionReason?: string | null;
      updatedAt?: Timestamp;
    };
    res.json({
      data: {
        employeeId: req.params.id,
        basicAmount: d.basicAmount ?? 0,
        payModel: d.payModel ?? "MONTHLY",
        currency: d.currency ?? "AFN",
        effectiveFrom: d.effectiveFrom ?? null,
        revisionReason: d.revisionReason ?? null,
        updatedAt: toIso(d.updatedAt ?? null),
      },
    });
  }),
);

/** Sets or revises the employee's basic salary. */
payrollRouter.put(
  "/employees/:id/salary",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, salarySchema);

    const employeeRef = tenant(auth.companyId, "employees").doc(req.params.id);
    if (!(await employeeRef.get()).exists) {
      throw ApiError.notFound("Employee not found");
    }

    const ref = tenant(auth.companyId, "employeeSalaries").doc(req.params.id);
    const before = (await ref.get()).data() ?? null;
    const { profile } = await getSettings(auth.companyId);

    const doc = {
      employeeId: req.params.id,
      structureId: null,
      basicAmount: payload.basicAmount,
      // Omitting it on an edit keeps the model already on file rather than
      // silently moving somebody back to a monthly salary.
      payModel: payload.payModel ?? (before?.payModel as string | undefined) ?? "MONTHLY",
      currency: profile.currency,
      effectiveFrom: payload.effectiveFrom,
      revisionReason: payload.revisionReason ?? null,
      updatedAt: nowTimestamp(),
    };
    await ref.set(doc, { merge: true });

    // Pay is the kind of change that has to be answerable for later.
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "payroll.salary.set",
      resourceType: "employeeSalaries",
      resourceId: req.params.id,
      before,
      after: doc,
    });

    res.json({ data: { ...doc, updatedAt: toIso(doc.updatedAt) } });
  }),
);

const componentSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(24).regex(/^[A-Z0-9_]+$/, "Use A–Z, 0–9 and underscore"),
  type: z.enum(["EARNING", "DEDUCTION", "EMPLOYER_COST"]),
  calc: z.enum(["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_GROSS"]),
  value: z.number().min(0).max(100_000_000),
  // Defaults to taxable: Afghan income tax treats salary and most allowances
  // as part of the base, and defaulting the other way silently under-withholds.
  taxable: z.boolean().optional().default(true),
  // Defaults to ALL, which is what every component did before this existed.
  scope: z.enum(["ALL", "INDIVIDUAL"]).optional().default("ALL"),
  active: z.boolean().optional().default(true),
});

/** Allowances, deductions and employer costs applied to every payslip. */
payrollRouter.get(
  "/components",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snap = await tenant(auth.companyId, "salaryComponents").limit(200).get();
    res.json({
      data: snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name,
          code: d.code,
          type: d.type,
          calc: d.calc,
          value: d.value,
          taxable: d.taxable ?? true,
          // Components written before individual assignment applied to all.
          scope: d.scope ?? "ALL",
          active: d.active ?? true,
        };
      }),
    });
  }),
);

payrollRouter.post(
  "/components",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, componentSchema);

    // The code identifies the line on every payslip, so it has to stay unique.
    const clash = await tenant(auth.companyId, "salaryComponents")
      .where("code", "==", payload.code)
      .limit(1)
      .get();
    if (!clash.empty) {
      throw ApiError.business(ErrorCodes.CONFLICT, `A component with code ${payload.code} exists`);
    }

    const id = ulid();
    const doc = { companyId: auth.companyId, ...payload, updatedAt: nowTimestamp() };
    await tenant(auth.companyId, "salaryComponents").doc(id).create(doc);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "payroll.component.create",
      resourceType: "salaryComponents",
      resourceId: id,
      after: doc,
    });
    res.status(201).json({ data: { id, ...payload } });
  }),
);

payrollRouter.put(
  "/components/:id",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, componentSchema);
    const ref = tenant(auth.companyId, "salaryComponents").doc(req.params.id);
    const existing = await ref.get();
    if (!existing.exists) {
      throw ApiError.notFound("Salary component not found");
    }

    const clash = await tenant(auth.companyId, "salaryComponents")
      .where("code", "==", payload.code)
      .limit(2)
      .get();
    if (clash.docs.some((d) => d.id !== req.params.id)) {
      throw ApiError.business(ErrorCodes.CONFLICT, `A component with code ${payload.code} exists`);
    }

    const doc = { companyId: auth.companyId, ...payload, updatedAt: nowTimestamp() };
    await ref.set(doc);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "payroll.component.update",
      resourceType: "salaryComponents",
      resourceId: req.params.id,
      before: existing.data(),
      after: doc,
    });
    res.json({ data: { id: req.params.id, ...payload } });
  }),
);

/**
 * Which components apply to one employee, and at what amount.
 *
 * Read with payroll:read and written with payroll:run, the same as the
 * component definitions themselves — assigning an allowance is a pay decision,
 * not an employee-record edit.
 */
payrollRouter.get(
  "/employees/:employeeId/components",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listAssignmentsFor(auth.companyId, req.params.employeeId) });
  }),
);

payrollRouter.put(
  "/employees/:employeeId/components/:componentId",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { employeeId, componentId } = req.params;
    const payload = parseBody(req, assignmentWriteSchema);

    // Refuse to point at things that are not there: an assignment against a
    // deleted component or a mistyped employee id would sit in the collection
    // doing nothing, and would be found only when someone's pay looked wrong.
    const [employee, component] = await Promise.all([
      tenant(auth.companyId, "employees").doc(employeeId).get(),
      tenant(auth.companyId, "salaryComponents").doc(componentId).get(),
    ]);
    if (!employee.exists) throw ApiError.notFound("Employee not found");
    if (!component.exists) throw ApiError.notFound("Salary component not found");

    const assignment = await setAssignment(auth.companyId, employeeId, componentId, payload);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "payroll.assignment.set",
      resourceType: "employeeComponents",
      resourceId: assignmentId(employeeId, componentId),
      after: assignment,
    });
    res.json({ data: assignment });
  }),
);

/** Returns the employee to whatever the component itself does. */
payrollRouter.delete(
  "/employees/:employeeId/components/:componentId",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { employeeId, componentId } = req.params;
    await clearAssignment(auth.companyId, employeeId, componentId);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "payroll.assignment.clear",
      resourceType: "employeeComponents",
      resourceId: assignmentId(employeeId, componentId),
    });
    res.status(204).send();
  }),
);
