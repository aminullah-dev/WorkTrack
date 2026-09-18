import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { addDays, daysBetween } from "../lib/dates";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { FEATURE_KEYS, GRACE_DAYS, normalizePlan, planDef, planIdSchema } from "./plans";
import type { FeatureKey, PlanId } from "./plans";

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
  plan: "BRONZE",
  deviceLimit: 5,
  status: "ACTIVE",
  expiresAt: null,
  // Off until the vendor issues a licence that turns it on. A company with no
  // licence on file is a trial or a pre-sale tenant, and gets a working product
  // with a generous seat count rather than a locked one.
  enforceDevices: false,
  // Same reasoning, and it is what keeps every company that predates the plans
  // working exactly as it did: capabilities are only ever withheld from a
  // company whose licence says to withhold them.
  enforcePlan: false,
  employeeLimit: null,
  extraFeatures: [],
  source: "VENDOR",
};

export type LicensePlan = PlanId;
export type LicenseStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED";

/** Who last wrote a licence. A payment must never quietly undo a vendor's grant. */
export type LicenseSource = "VENDOR" | "SELF_SERVE";

export interface License {
  plan: LicensePlan;
  deviceLimit: number;
  status: LicenseStatus;
  /** YYYY-MM-DD, or null for a perpetual licence. */
  expiresAt: string | null;
  enforceDevices: boolean;
  /** Whether the plan's capabilities and caps are enforced at all. */
  enforcePlan: boolean;
  /** A cap negotiated for this one company; null means the plan's own. */
  employeeLimit: number | null;
  /** Capabilities granted on top of the plan, for the customer who needs one. */
  extraFeatures: FeatureKey[];
  source: LicenseSource;
}

/**
 * Accepts the tier names a licence may already carry. FREE/STANDARD/ENTERPRISE
 * were issued by hand before the plans were sold, and both the console and the
 * CLI can still send them; they are normalised on the way in rather than
 * migrated, so no stored document has to be rewritten to be readable.
 */
const planInputSchema = z
  .union([planIdSchema, z.enum(["FREE", "STANDARD", "ENTERPRISE"])])
  .transform(normalizePlan);

export const licenseWriteSchema = z.object({
  plan: planInputSchema,
  deviceLimit: z.number().int().min(1).max(100_000),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED"]),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .nullish(),
  enforceDevices: z.boolean(),
  // Optional throughout: a caller that predates these fields (the CLI, an older
  // console) keeps whatever the licence already says rather than resetting it.
  enforcePlan: z.boolean().optional(),
  employeeLimit: z.number().int().min(1).max(100_000).nullish(),
  extraFeatures: z.array(z.enum(FEATURE_KEYS)).max(FEATURE_KEYS.length).optional(),
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

export interface DeviceDoc {
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

/** A stored licence, with every field this version knows about filled in. */
export function normalizeLicense(stored: Partial<License> | undefined): License {
  return {
    plan: stored?.plan === undefined ? DEFAULT_LICENSE.plan : normalizePlan(stored.plan),
    deviceLimit: stored?.deviceLimit ?? DEFAULT_LICENSE.deviceLimit,
    status: stored?.status ?? DEFAULT_LICENSE.status,
    expiresAt: stored?.expiresAt ?? DEFAULT_LICENSE.expiresAt,
    enforceDevices: stored?.enforceDevices ?? DEFAULT_LICENSE.enforceDevices,
    enforcePlan: stored?.enforcePlan ?? DEFAULT_LICENSE.enforcePlan,
    employeeLimit: stored?.employeeLimit ?? DEFAULT_LICENSE.employeeLimit,
    extraFeatures: stored?.extraFeatures ?? [],
    source: stored?.source ?? DEFAULT_LICENSE.source,
  };
}

export async function getLicense(cid: string): Promise<License> {
  const snap = await db.collection("companies").doc(cid).get();
  return normalizeLicense(snap.data()?.license as Partial<License> | undefined);
}

export async function setLicense(
  cid: string,
  input: z.infer<typeof licenseWriteSchema>,
  source: LicenseSource = "VENDOR",
): Promise<License> {
  // Read first: the fields a caller omitted are the ones it does not know
  // about, and defaulting them would let an older client silently revoke a
  // capability the vendor granted through a newer one.
  const current = await getLicense(cid);
  const license: License = {
    // Normalised again here rather than trusted: the CLI and the tests call
    // this directly, without the schema that would have done it.
    plan: normalizePlan(input.plan),
    deviceLimit: input.deviceLimit,
    status: input.status,
    expiresAt: input.expiresAt ?? null,
    enforceDevices: input.enforceDevices,
    enforcePlan: input.enforcePlan ?? current.enforcePlan,
    employeeLimit: input.employeeLimit === undefined ? current.employeeLimit : input.employeeLimit,
    extraFeatures: input.extraFeatures ?? current.extraFeatures,
    source,
  };
  await db.collection("companies").doc(cid).set(
    { license, updatedAt: nowTimestamp() },
    { merge: true },
  );
  return license;
}

/**
 * Where a licence stands today.
 *
 *   ACTIVE  in force.
 *   GRACE   expired, inside the grace window — everything still works, loudly.
 *   LAPSED  expired past the grace window, or suspended by the vendor.
 */
export type LicenseState = "ACTIVE" | "GRACE" | "LAPSED";

export interface LicenseStanding {
  state: LicenseState;
  /** Days until the next transition; null for a perpetual licence. */
  daysLeft: number | null;
  /** The last day the grace window covers, or null when nothing expires. */
  graceEndsAt: string | null;
}

export function licenseStanding(license: License, today: string): LicenseStanding {
  if (license.status !== "ACTIVE") {
    return { state: "LAPSED", daysLeft: 0, graceEndsAt: null };
  }
  if (license.expiresAt === null) {
    return { state: "ACTIVE", daysLeft: null, graceEndsAt: null };
  }
  const graceEndsAt = addDays(license.expiresAt, GRACE_DAYS);
  if (today <= license.expiresAt) {
    return { state: "ACTIVE", daysLeft: daysBetween(today, license.expiresAt), graceEndsAt };
  }
  if (today <= graceEndsAt) {
    return { state: "GRACE", daysLeft: daysBetween(today, graceEndsAt), graceEndsAt };
  }
  return { state: "LAPSED", daysLeft: 0, graceEndsAt };
}

/**
 * A licence is usable while it is in force, and stays usable through the grace
 * window. A payment that arrives three days late is a customer paying, not a
 * reason to have stopped a factory's attendance on the day the term ended.
 */
export function licenseUsable(license: License, today: string): boolean {
  return licenseStanding(license, today).state !== "LAPSED";
}

/** What a company may actually do: the plan, plus anything granted on top. */
export interface Entitlements {
  plan: PlanId;
  features: FeatureKey[];
  employeeLimit: number;
  deviceLimit: number;
  /** False when nothing here is enforced — the caps are contractual only. */
  enforced: boolean;
}

export async function entitlementsOf(license: License): Promise<Entitlements> {
  const plan = await planDef(license.plan);
  return {
    plan: plan.id,
    features: [...new Set([...plan.features, ...license.extraFeatures])],
    employeeLimit: license.employeeLimit ?? plan.employeeLimit,
    // The seat count is whatever the licence says: the vendor sets it directly,
    // and a purchase writes the plan's own number into it.
    deviceLimit: license.deviceLimit,
    enforced: license.enforcePlan,
  };
}

export async function entitlements(cid: string): Promise<Entitlements> {
  return entitlementsOf(await getLicense(cid));
}

export function hasFeature(ent: Entitlements, key: FeatureKey): boolean {
  return ent.features.includes(key);
}

/** Active employees on the books. The cap counts people, not records. */
export async function countActiveEmployees(cid: string): Promise<number> {
  const snap = await tenant(cid, "employees").where("status", "==", "ACTIVE").count().get();
  return snap.data().count;
}

/**
 * Refuses to add one more employee when the plan is full.
 *
 * Checked before the login is created, because a refusal after that leaves an
 * orphaned Firebase account nobody can see or clean up from the portal.
 */
export async function assertEmployeeHeadroom(cid: string): Promise<void> {
  const ent = await entitlements(cid);
  if (!ent.enforced) return;
  const active = await countActiveEmployees(cid);
  if (active < ent.employeeLimit) return;
  throw new ApiError(
    403,
    ErrorCodes.PLAN_LIMIT_REACHED,
    `This plan covers ${ent.employeeLimit} employees and all of them are in use. Upgrade the plan, or set someone who has left to EXITED.`,
  );
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
