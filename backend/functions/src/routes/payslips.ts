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
    const year = Number.parseInt(String(req.query.year ?? ""), 10);
    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      throw ApiError.validation("year query parameter is required");
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
