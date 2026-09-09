import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { audit, tenant } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  advanceToDto,
  cancelAdvance,
  createAdvance,
  type AdvanceDoc,
} from "../services/advanceStore";

/**
 * Money handed to somebody before payday.
 *
 * Gated on payroll:run rather than payroll:read — recording an advance decides
 * what comes out of a wage, so it belongs to whoever is trusted to run the
 * payroll, not to everyone who may look at one.
 */
export const advancesRouter = Router();

const createSchema = z.object({
  employeeId: z.string().min(1),
  // Positive: an advance of zero is not a transaction, and a negative one is
  // somebody trying to express a bonus through the wrong form.
  principal: z.number().positive().max(100_000_000),
  /** Null takes it all at the next payroll, which is right for a small advance. */
  instalment: z.number().positive().max(100_000_000).nullish(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(400).nullish(),
});

advancesRouter.get(
  "/",
  requirePermission("payroll:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;

    let query = tenant(auth.companyId, "advances").orderBy("issuedOn", "desc").limit(200);
    if (employeeId) {
      query = tenant(auth.companyId, "advances")
        .where("employeeId", "==", employeeId)
        .orderBy("issuedOn", "desc")
        .limit(200);
    }

    const snap = await query.get();
    res.json({
      data: snap.docs.map((d) => advanceToDto(d.id, d.data() as AdvanceDoc)),
    });
  }),
);

advancesRouter.post(
  "/",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, createSchema);

    const { id, doc } = await createAdvance(
      auth.companyId,
      {
        employeeId: payload.employeeId,
        principal: payload.principal,
        instalment: payload.instalment ?? null,
        issuedOn: payload.issuedOn,
        note: payload.note ?? null,
      },
      auth.employeeId,
    );

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "advances.create",
      resourceType: "advances",
      resourceId: id,
      after: { employeeId: payload.employeeId, principal: payload.principal },
    });

    res.status(201).json({ data: advanceToDto(id, doc) });
  }),
);

/**
 * Cancels an advance recorded in error. Not a delete: money handed over and
 * then written off is precisely what an audit needs to still be able to see.
 */
advancesRouter.post(
  "/:id/cancel",
  requirePermission("payroll:run"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await cancelAdvance(auth.companyId, req.params.id);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "advances.cancel",
      resourceType: "advances",
      resourceId: req.params.id,
    });

    res.json({ data: { id: req.params.id, status: "CANCELLED" } });
  }),
);
