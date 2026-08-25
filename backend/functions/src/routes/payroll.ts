import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes, asyncHandler } from "../lib/errors";
import { audit, db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
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

    const idempotencyKey = req.header("Idempotency-Key");
    if (idempotencyKey) {
      const replay = await checkIdempotency(auth.companyId, idempotencyKey);
      if (replay !== null) {
        res.json({ data: replay });
        return;
      }
    }

    const companySnap = await db.collection("companies").doc(auth.companyId).get();
    const currency = (companySnap.data()?.currency as string | undefined) ?? "AFN";

    const result = await computePayrollRun(
      auth.companyId,
      periodYear,
      periodMonth,
      auth.employeeId,
      currency,
    );

    if (idempotencyKey) {
      await recordIdempotency(auth.companyId, idempotencyKey, result);
    }
    res.status(201).json({ data: result });
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
        const emp = empSnap.data() as { firstName?: string; lastName?: string } | undefined;
        return {
          id: doc.id,
          employeeId: d.employeeId,
          employeeName: emp ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : d.employeeId,
          currency: d.currency,
          gross: d.gross,
          totalDeductions: d.totalDeductions,
          net: d.net,
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
  basicAmount: z.number().min(0).max(100_000_000),
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
      currency?: string;
      effectiveFrom?: string;
      revisionReason?: string | null;
      updatedAt?: Timestamp;
    };
    res.json({
      data: {
        employeeId: req.params.id,
        basicAmount: d.basicAmount ?? 0,
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
  taxable: z.boolean().optional().default(false),
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
          taxable: d.taxable ?? false,
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
