import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { audit, tenant } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  deletePieceRecord,
  pieceRecordToDto,
  recordPieces,
  type PieceRecordDoc,
} from "../services/pieceWork";

/**
 * What piece-rate workers finished.
 *
 * Gated on payroll:run for writes: a piece count IS the wage for anybody on
 * that model, so recording one is the same kind of act as setting a salary.
 */
export const pieceWorkRouter = Router();

const createSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  // Fractions allowed: half a garment finished at month end is a real thing in
  // a workshop, and forcing whole numbers would push it into the next month.
  quantity: z.number().positive().max(1_000_000),
  note: z.string().max(200).nullish(),
});

pieceWorkRouter.get(
  "/",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;

    const base = tenant(auth.companyId, "pieceRecords");
    const query = employeeId
      ? base.where("employeeId", "==", employeeId).orderBy("date", "desc").limit(300)
      : base.orderBy("date", "desc").limit(300);

    const snap = await query.get();
    res.json({ data: snap.docs.map((d) => pieceRecordToDto(d.id, d.data() as PieceRecordDoc)) });
  }),
);

pieceWorkRouter.post(
  "/",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, createSchema);

    const { id, doc } = await recordPieces(
      auth.companyId,
      {
        employeeId: payload.employeeId,
        date: payload.date,
        quantity: payload.quantity,
        note: payload.note ?? null,
      },
      auth.employeeId,
    );

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "pieceWork.create",
      resourceType: "pieceRecords",
      resourceId: id,
      after: { employeeId: payload.employeeId, quantity: payload.quantity, date: payload.date },
    });

    res.status(201).json({ data: pieceRecordToDto(id, doc) });
  }),
);

/**
 * Removes a miscounted entry.
 *
 * A real delete rather than a cancellation, unlike an advance: nothing was
 * handed to anybody, and a workshop correcting "40" to "35" an hour later
 * should not leave two rows for one day's work to argue over.
 */
pieceWorkRouter.delete(
  "/:id",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deletePieceRecord(auth.companyId, req.params.id);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "pieceWork.delete",
      resourceType: "pieceRecords",
      resourceId: req.params.id,
    });

    res.json({ data: { id: req.params.id } });
  }),
);
