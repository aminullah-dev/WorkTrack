import { Router } from "express";
import { ApiError, asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  assignRoster,
  createShift,
  listShifts,
  rosterAssignSchema,
  rosterForDate,
  shiftWriteSchema,
  updateShift,
} from "../services/shifts";

export const shiftsRouter = Router();

/** List shift definitions (any authed member; the apps render today's shift). */
shiftsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listShifts(auth.companyId) });
  }),
);

shiftsRouter.post(
  "/",
  requirePermission("rosters:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, shiftWriteSchema);
    const dto = await createShift(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: dto });
  }),
);

shiftsRouter.put(
  "/:id",
  requirePermission("rosters:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, shiftWriteSchema);
    const dto = await updateShift(auth.companyId, req.params.id, payload, auth.employeeId, auth.roles);
    res.json({ data: dto });
  }),
);

// ------------------------------------------------------------------ roster

shiftsRouter.post(
  "/roster/assign",
  requirePermission("rosters:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, rosterAssignSchema);
    const result = await assignRoster(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: result });
  }),
);

shiftsRouter.get(
  "/roster",
  requirePermission("rosters:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const date = String(req.query.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw ApiError.validation("date must be an ISO date (YYYY-MM-DD)");
    }
    res.json({ data: { date, rows: await rosterForDate(auth.companyId, date) } });
  }),
);
