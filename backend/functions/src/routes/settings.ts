import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { getSettings, settingsUpdateSchema, updateSettings } from "../services/settings";

export const settingsRouter = Router();

/** Any authenticated member may read settings (apps gate UI on the feature flags). */
settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await getSettings(auth.companyId) });
  }),
);

/** Only the company admin edits configuration (the dedicated-admin surface). */
settingsRouter.put(
  "/",
  requirePermission("settings:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const patch = parseBody(req, settingsUpdateSchema);
    const next = await updateSettings(auth.companyId, patch, auth.employeeId, auth.roles);
    res.json({ data: next });
  }),
);
