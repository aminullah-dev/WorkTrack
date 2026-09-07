import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant, toIso } from "../lib/firestore";

/**
 * Per-device licensing.
 *
 * A company's licence grants a number of device seats. Every phone running the
 * employee app and every kiosk tablet occupies one seat, identified by a stable
 * id the client generates once and keeps. Activating a device that is already
 * registered refreshes it and costs nothing; activating a new one takes a seat,
 * and is refused when none are left.
 *
 * Seat accounting runs in a transaction. Counting seats and then writing the
 * device as two steps would let two tablets set up side by side both see "one
 * seat left" and both take it — the same class of bug the idempotency and
 * expense paths had.
 */

/** Seats granted when a company has no licence on file. */
export const DEFAULT_LICENSE: License = {
  plan: "FREE",
  deviceLimit: 5,
  status: "ACTIVE",
  expiresAt: null,
  // Off until the vendor issues a licence that turns it on. A company with no
  // licence on file is a trial or a pre-sale tenant, and gets a working product
  // with a generous seat count rather than a locked one.
  enforceDevices: false,
};

export type LicensePlan = "FREE" | "STANDARD" | "ENTERPRISE";
export type LicenseStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED";

export interface License {
  plan: LicensePlan;
  deviceLimit: number;
  status: LicenseStatus;
  /** YYYY-MM-DD, or null for a perpetual licence. */
  expiresAt: string | null;
  enforceDevices: boolean;
}

export const licenseWriteSchema = z.object({
  plan: z.enum(["FREE", "STANDARD", "ENTERPRISE"]),
  deviceLimit: z.number().int().min(1).max(100_000),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED"]),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  enforceDevices: z.boolean(),
});

export const deviceActivateSchema = z.object({
  deviceId: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/, "Use A–Z, 0–9, _ and -"),
  platform: z.enum(["ANDROID", "IOS", "WEB"]),
  model: z.string().max(80).nullish(),
  appVersion: z.string().max(40).nullish(),
});

export type DeviceActivation = z.infer<typeof deviceActivateSchema>;

export interface DeviceDto {
  deviceId: string;
  type: string;
  label: string | null;
  platform: string | null;
  model: string | null;
  appVersion: string | null;
  employeeId: string | null;
  branchId: string | null;
  status: "ACTIVE" | "REVOKED";
  activatedAt: string | null;
  lastSeenAt: string | null;
}

interface DeviceDoc {
  type?: string;
  label?: string | null;
  platform?: string | null;
  model?: string | null;
  appVersion?: string | null;
  employeeId?: string | null;
  branchId?: string | null;
  status?: "ACTIVE" | "REVOKED";
  /** Kiosk records predate `status` and carry this instead. */
  active?: boolean;
  activatedAt?: Timestamp | null;
  lastSeenAt?: Timestamp | null;
}

/**
 * A device counts against the licence unless it has been revoked. Kiosk records
 * were written before `status` existed and carry `active` instead, so both are
 * honoured — a kiosk someone deactivated must not keep holding a seat.
 */
export function isDeviceActive(doc: DeviceDoc): boolean {
  if (doc.status === "REVOKED") return false;
  if (doc.active === false) return false;
  return true;
}

function toDeviceDto(deviceId: string, doc: DeviceDoc): DeviceDto {
  return {
    deviceId,
    type: doc.type ?? "MOBILE",
    label: doc.label ?? null,
    platform: doc.platform ?? null,
    model: doc.model ?? null,
    appVersion: doc.appVersion ?? null,
    employeeId: doc.employeeId ?? null,
    branchId: doc.branchId ?? null,
    status: isDeviceActive(doc) ? "ACTIVE" : "REVOKED",
    activatedAt: toIso(doc.activatedAt ?? null),
    lastSeenAt: toIso(doc.lastSeenAt ?? null),
  };
}

export async function getLicense(cid: string): Promise<License> {
  const snap = await db.collection("companies").doc(cid).get();
  const stored = snap.data()?.license as Partial<License> | undefined;
  return {
    plan: stored?.plan ?? DEFAULT_LICENSE.plan,
    deviceLimit: stored?.deviceLimit ?? DEFAULT_LICENSE.deviceLimit,
    status: stored?.status ?? DEFAULT_LICENSE.status,
    expiresAt: stored?.expiresAt ?? DEFAULT_LICENSE.expiresAt,
    enforceDevices: stored?.enforceDevices ?? DEFAULT_LICENSE.enforceDevices,
  };
}

export async function setLicense(cid: string, input: z.infer<typeof licenseWriteSchema>): Promise<License> {
  const license: License = {
    plan: input.plan,
    deviceLimit: input.deviceLimit,
    status: input.status,
    expiresAt: input.expiresAt ?? null,
    enforceDevices: input.enforceDevices,
  };
  await db.collection("companies").doc(cid).set(
    { license, updatedAt: nowTimestamp() },
    { merge: true },
  );
  return license;
}

/** A licence is usable when it is ACTIVE and has not run out. */
export function licenseUsable(license: License, today: string): boolean {
  if (license.status !== "ACTIVE") return false;
  if (license.expiresAt !== null && license.expiresAt < today) return false;
  return true;
}

export interface ActivationResult {
  device: DeviceDto;
  deviceLimit: number;
  devicesInUse: number;
  /** True when this call took a new seat rather than refreshing one. */
  seatTaken: boolean;
}

/**
 * Registers a device against the company's licence, or refreshes it if it is
 * already registered. Refused when the licence is not usable, when the device
 * was revoked, or when every seat is taken.
 */
export async function activateDevice(
  cid: string,
  employeeId: string,
  input: DeviceActivation,
  today: string,
): Promise<ActivationResult> {
  const license = await getLicense(cid);
  if (!licenseUsable(license, today)) {
    throw new ApiError(
      403,
      ErrorCodes.LICENSE_INACTIVE,
      license.status === "ACTIVE"
        ? "This company's licence has expired"
        : `This company's licence is ${license.status.toLowerCase()}`,
    );
  }

  const devices = tenant(cid, "devices");
  const ref = devices.doc(input.deviceId);
  const now = nowTimestamp();

  return db.runTransaction(async (tx) => {
    // Every read happens before any write: Firestore rejects a transaction that
    // reads after writing, and the refresh path below used to do exactly that.
    const existing = await tx.get(ref);
    const inUse = await countActive(tx, devices);

    if (existing.exists) {
      const doc = existing.data() as DeviceDoc;
      if (!isDeviceActive(doc)) {
        throw new ApiError(
          403,
          ErrorCodes.DEVICE_REVOKED,
          "This device has been revoked. Ask an administrator to re-enable it.",
        );
      }
      // Already holds a seat — refresh it without touching the count.
      const updated: DeviceDoc = {
        ...doc,
        platform: input.platform,
        model: input.model ?? doc.model ?? null,
        appVersion: input.appVersion ?? null,
        employeeId,
        lastSeenAt: now,
      };
      tx.set(ref, { ...updated, updatedAt: now }, { merge: true });

      // This device already holds one of the counted seats.
      return {
        device: toDeviceDto(input.deviceId, updated),
        deviceLimit: license.deviceLimit,
        devicesInUse: inUse,
        seatTaken: false,
      };
    }

    if (inUse >= license.deviceLimit) {
      throw new ApiError(
        403,
        ErrorCodes.LICENSE_LIMIT_REACHED,
        `All ${license.deviceLimit} device seats on this licence are in use. Revoke a device or upgrade the licence.`,
      );
    }

    const doc: DeviceDoc = {
      type: "MOBILE",
      label: null,
      platform: input.platform,
      model: input.model ?? null,
      appVersion: input.appVersion ?? null,
      employeeId,
      branchId: null,
      status: "ACTIVE",
      activatedAt: now,
      lastSeenAt: now,
    };
    tx.set(ref, { ...doc, companyId: cid, deviceId: input.deviceId, updatedAt: now });

    return {
      device: toDeviceDto(input.deviceId, doc),
      deviceLimit: license.deviceLimit,
      devicesInUse: inUse + 1,
      seatTaken: true,
    };
  });
}

/**
 * Seats in use, counted inside the caller's transaction so the count and the
 * write that depends on it cannot be separated by a concurrent activation.
 */
async function countActive(
  tx: FirebaseFirestore.Transaction,
  devices: FirebaseFirestore.CollectionReference,
): Promise<number> {
  const snap = await tx.get(devices.limit(1000));
  return snap.docs.filter((d) => isDeviceActive(d.data() as DeviceDoc)).length;
}

export async function listDevices(cid: string): Promise<DeviceDto[]> {
  const snap = await tenant(cid, "devices").limit(1000).get();
  return snap.docs
    .map((d) => toDeviceDto(d.id, d.data() as DeviceDoc))
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
}

/** Frees the seat a device holds. Revoking an unknown device is a 404. */
export async function setDeviceStatus(
  cid: string,
  deviceId: string,
  status: "ACTIVE" | "REVOKED",
): Promise<DeviceDto> {
  const ref = tenant(cid, "devices").doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Device not found");

  // Written to both fields so a kiosk record, which predates `status`, is
  // consistently revoked whichever field a reader looks at.
  await ref.set(
    { status, active: status === "ACTIVE", updatedAt: nowTimestamp() },
    { merge: true },
  );
  return toDeviceDto(deviceId, { ...(snap.data() as DeviceDoc), status, active: status === "ACTIVE" });
}
