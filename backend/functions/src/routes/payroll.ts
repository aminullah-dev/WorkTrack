import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, asyncHandler } from "../lib/errors";
import { db, tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import { computePayrollRun } from "../services/payroll";

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
