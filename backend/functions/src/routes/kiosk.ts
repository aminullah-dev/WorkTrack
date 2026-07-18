import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { signKioskToken } from "../services/kiosk";
import { kioskSecret } from "../config";

export const kioskRouter = Router();

/**
 * Issues the current rotating kiosk token for a shared check-in screen. The
 * kiosk page polls this every ~20s and renders the token as a QR; employees
 * scan it in the app to punch. The HMAC secret never leaves the server, so the
 * token must be minted here. Requires kiosk:issue (managers/admins).
 */
kioskRouter.get(
  "/token",
  requirePermission("kiosk:issue"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const kioskId = String(req.query.kioskId ?? auth.branchIds[0] ?? "kiosk").slice(0, 64);
    const token = signKioskToken(kioskSecret.value(), kioskId);
    res.json({ data: { token, kioskId, rotateSeconds: 30 } });
  }),
);
