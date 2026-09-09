import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { db } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { signKioskToken } from "../services/kiosk";
import {
  createKioskAccount,
  kioskAccountCreateSchema,
  listKioskAccounts,
  resetKioskPassword,
} from "../services/kiosk-account";
import { kioskSecret } from "../config";

export const kioskRouter = Router();

/**
 * Issues the current rotating kiosk token for a shared check-in screen. The
 * kiosk page polls this every ~20s and renders the token as a QR; employees
 * scan it in the app to punch. The HMAC secret never leaves the server, so the
 * token must be minted here. Requires kiosk:issue (managers/admins or a
 * dedicated KIOSK device account).
 */
kioskRouter.get(
  "/token",
  requirePermission("kiosk:issue"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const kioskId = String(req.query.kioskId ?? auth.branchIds[0] ?? "kiosk").slice(0, 64);
    const token = signKioskToken(kioskSecret.value(), kioskId);
    const companySnap = await db.collection("companies").doc(auth.companyId).get();
    const companyName = (companySnap.data()?.name as string | undefined) ?? "";
    res.json({ data: { token, kioskId, companyName, rotateSeconds: 30 } });
  }),
);

// ------------------------------------------------------ dedicated accounts

/** Provision a KIOSK-role login for an unattended device. */
kioskRouter.post(
  "/accounts",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, kioskAccountCreateSchema);
    const dto = await createKioskAccount(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: dto });
  }),
);

kioskRouter.get(
  "/accounts",
  requirePermission("employees:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listKioskAccounts(auth.companyId) });
  }),
);

kioskRouter.post(
  "/accounts/:id/reset",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await resetKioskPassword(auth.companyId, req.params.id) });
  }),
);
