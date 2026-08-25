import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError, asyncHandler } from "../lib/errors";
import { tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";

export const payslipsRouter = Router();

/** Self-service payslips for one year. Finalized/paid slips only. */
payslipsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    // periodYear is a Solar Hijri year (payroll.ts writes 1405, not 2026), so a
    // Gregorian range rejected every request the app has ever made.
    const year = Number.parseInt(String(req.query.year ?? ""), 10);
    if (Number.isNaN(year) || year < 1300 || year > 1500) {
      throw ApiError.validation("year must be a Solar Hijri year (1300–1500)");
    }

    const snapshot = await tenant(auth.companyId, "payslips")
      .where("employeeId", "==", auth.employeeId)
      .where("periodYear", "==", year)
      .get();

    res.json({
      data: snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((slip) => (slip as { status?: string }).status !== "DRAFT")
        .map((slip) => ({
          ...slip,
          updatedAt: toIso((slip as { updatedAt?: Timestamp }).updatedAt ?? null),
        })),
    });
  }),
);
