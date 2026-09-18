import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { localDateOf } from "../services/attendance";
import {
  cancelDeletion,
  deletionRequestSchema,
  getDeletion,
  GRACE_DAYS,
  requestDeletion,
} from "../services/companyDeletion";
import { getSettings } from "../services/settings";

export const companyRouter = Router();

/**
 * Closing the company account.
 *
 * Gated on company:delete, which only a COMPANY_ADMIN holds through the admin
 * wildcard — HR and finance administrators run the company day to day but do
 * not get to end it.
 */
companyRouter.get(
  "/deletion",
  requirePermission("company:delete"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const deletion = await getDeletion(auth.companyId);
    res.json({ data: { ...deletion, graceDays: GRACE_DAYS } });
  }),
);

companyRouter.post(
  "/deletion",
  requirePermission("company:delete"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, deletionRequestSchema);
    // Dated in the company's own zone, so the grace period is counted in the
    // days the company actually lives in.
    const settings = await getSettings(auth.companyId);
    const today = localDateOf(new Date(), settings.profile.timezone);

    const deletion = await requestDeletion(
      auth.companyId,
      auth.employeeId,
      auth.roles.join(","),
      payload,
      today,
    );
    res.status(202).json({ data: { ...deletion, graceDays: GRACE_DAYS } });
  }),
);

companyRouter.delete(
  "/deletion",
  requirePermission("company:delete"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const deletion = await cancelDeletion(
      auth.companyId,
      auth.employeeId,
      auth.roles.join(","),
    );
    res.json({ data: { ...deletion, graceDays: GRACE_DAYS } });
  }),
);
