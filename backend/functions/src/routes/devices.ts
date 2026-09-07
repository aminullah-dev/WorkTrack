import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { audit } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  activateDevice,
  deviceActivateSchema,
  getLicense,
  licenseWriteSchema,
  listDevices,
  setDeviceStatus,
  setLicense,
} from "../services/license";
import { getSettings } from "../services/settings";
import { localDateOf } from "../services/attendance";

export const devicesRouter = Router();

/**
 * Claims a licence seat for the calling device, or refreshes the one it holds.
 * Any signed-in employee may activate the phone in their hand — the licence,
 * not the role, is what limits how many devices a company can run.
 */
devicesRouter.post(
  "/activate",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, deviceActivateSchema);

    // Expiry is judged against the company's own calendar date, not the
    // server's — a licence must not lapse hours early in Kabul.
    const settings = await getSettings(auth.companyId);
    const today = localDateOf(new Date(), settings.profile.timezone);

    const result = await activateDevice(auth.companyId, auth.employeeId, payload, today);

    if (result.seatTaken) {
      await audit(auth.companyId, {
        actorId: auth.employeeId,
        actorRole: auth.roles.join(","),
        action: "device.activate",
        resourceType: "devices",
        resourceId: payload.deviceId,
        after: { platform: payload.platform, model: payload.model ?? null },
      });
    }

    res.status(result.seatTaken ? 201 : 200).json({ data: result });
  }),
);

devicesRouter.get(
  "/license",
  requirePermission("devices:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await getLicense(auth.companyId) });
  }),
);

devicesRouter.put(
  "/license",
  requirePermission("devices:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, licenseWriteSchema);
    const before = await getLicense(auth.companyId);
    const license = await setLicense(auth.companyId, payload);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "license.update",
      resourceType: "companies",
      resourceId: auth.companyId,
      before,
      after: license,
    });

    res.json({ data: license });
  }),
);

devicesRouter.get(
  "/",
  requirePermission("devices:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const [devices, license] = await Promise.all([
      listDevices(auth.companyId),
      getLicense(auth.companyId),
    ]);
    res.json({
      data: devices,
      meta: {
        deviceLimit: license.deviceLimit,
        devicesInUse: devices.filter((d) => d.status === "ACTIVE").length,
      },
    });
  }),
);

/** Frees the seat: the phone stops working against this company. */
devicesRouter.post(
  "/:deviceId/revoke",
  requirePermission("devices:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const device = await setDeviceStatus(auth.companyId, req.params.deviceId, "REVOKED");

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "device.revoke",
      resourceType: "devices",
      resourceId: req.params.deviceId,
      after: { status: "REVOKED" },
    });

    res.json({ data: device });
  }),
);

devicesRouter.post(
  "/:deviceId/restore",
  requirePermission("devices:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const device = await setDeviceStatus(auth.companyId, req.params.deviceId, "ACTIVE");

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "device.restore",
      resourceType: "devices",
      resourceId: req.params.deviceId,
      after: { status: "ACTIVE" },
    });

    res.json({ data: device });
  }),
);
