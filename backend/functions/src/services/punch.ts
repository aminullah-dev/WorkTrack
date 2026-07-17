import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { isValidUlid } from "../lib/ids";
import { audit, nowTimestamp, tenant } from "../lib/firestore";
import { haversineMeters, checkGeofence } from "./geo";
import { verifyKioskToken } from "./kiosk";
import { localDateOf, punchToDto, recomputeAttendanceDay, type PunchDoc } from "./attendance";

export const punchCreateSchema = z.object({
  id: z.string().length(26),
  punchedAt: z.string().datetime(),
  type: z.enum(["IN", "OUT"]),
  method: z.enum(["GPS", "QR", "FACE", "MANUAL", "KIOSK"]),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracyMeters: z.number().min(0).nullish(),
  geofenceId: z.string().nullish(),
  insideFence: z.boolean().optional().default(false),
  kioskToken: z.string().nullish(),
  note: z.string().max(500).nullish(),
});

export type PunchCreate = z.infer<typeof punchCreateSchema>;

const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000; // multi-day offline window
const IMPLAUSIBLE_SPEED_KMH = 250;

/**
 * Applies one punch: append-only, idempotent on the client-generated ULID.
 * The punch is always recorded as evidence; failed validations mark it
 * serverValidated=false with a reason instead of dropping the event.
 */
export async function applyPunch(
  cid: string,
  employeeId: string,
  payload: PunchCreate,
  kioskSecret: string,
): Promise<Record<string, unknown>> {
  if (!isValidUlid(payload.id)) {
    throw ApiError.validation("Punch id must be a ULID", { id: "Invalid ULID" });
  }

  const ref = tenant(cid, "punches").doc(payload.id);
  const existing = await ref.get();
  if (existing.exists) {
    // Idempotent replay: the first write wins, return the stored state.
    return punchToDto(payload.id, existing.data() as PunchDoc);
  }

  const punchedAt = new Date(payload.punchedAt);
  const now = Date.now();

  let serverValidated = true;
  let invalidReason: string | null = null;
  let geofenceId: string | null = payload.geofenceId ?? null;
  let insideFence = false;
  let kioskId: string | null = null;

  if (punchedAt.getTime() > now + MAX_FUTURE_SKEW_MS) {
    serverValidated = false;
    invalidReason = "TIME_SKEW";
  } else if (punchedAt.getTime() < now - MAX_BACKDATE_MS) {
    serverValidated = false;
    invalidReason = "TOO_OLD";
  }

  if (serverValidated && payload.method === "GPS") {
    if (payload.latitude == null || payload.longitude == null) {
      throw ApiError.validation("GPS punches require coordinates", {
        latitude: "Required for GPS method",
      });
    }
    const check = await checkGeofence(
      cid,
      payload.latitude,
      payload.longitude,
      payload.accuracyMeters ?? 0,
    );
    geofenceId = check.geofenceId;
    insideFence = check.insideFence;
    if (check.fencesConfigured && !check.insideFence) {
      serverValidated = false;
      invalidReason = ErrorCodes.GEOFENCE_VIOLATION;
    }
  }

  if (serverValidated && payload.method === "QR") {
    const token = payload.kioskToken ? verifyKioskToken(kioskSecret, payload.kioskToken) : null;
    if (!token) {
      serverValidated = false;
      invalidReason = ErrorCodes.KIOSK_TOKEN_INVALID;
    } else {
      kioskId = token.kioskId;
      insideFence = true; // physically at the kiosk
    }
  }

  // Speed-of-travel plausibility vs the most recent located, validated punch.
  if (serverValidated && payload.latitude != null && payload.longitude != null) {
    const prevSnap = await tenant(cid, "punches")
      .where("employeeId", "==", employeeId)
      .orderBy("punchedAt", "desc")
      .limit(1)
      .get();
    if (!prevSnap.empty) {
      const prev = prevSnap.docs[0].data() as PunchDoc;
      if (prev.serverValidated && prev.latitude != null && prev.longitude != null) {
        const meters = haversineMeters(
          prev.latitude,
          prev.longitude,
          payload.latitude,
          payload.longitude,
        );
        const hours = Math.max(
          (punchedAt.getTime() - prev.punchedAt.toMillis()) / 3_600_000,
          1 / 3600, // floor at one second to avoid divide-by-zero
        );
        if (meters / 1000 / hours > IMPLAUSIBLE_SPEED_KMH) {
          serverValidated = false;
          invalidReason = "IMPLAUSIBLE_TRAVEL";
        }
      }
    }
  }

  const doc: PunchDoc = {
    companyId: cid,
    employeeId,
    punchedAt: Timestamp.fromDate(punchedAt),
    type: payload.type,
    method: payload.method,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    accuracyMeters: payload.accuracyMeters ?? null,
    geofenceId,
    insideFence,
    kioskId,
    note: payload.note ?? null,
    serverValidated,
    invalidReason,
    updatedAt: nowTimestamp(),
  };
  // create() (not set) preserves append-only semantics under write races.
  await ref.create(doc);

  const companyDoc = await tenant(cid, "punches").parent!.get();
  const timezone = (companyDoc.data()?.timezone as string | undefined) ?? "UTC";
  await recomputeAttendanceDay(cid, employeeId, localDateOf(punchedAt, timezone), timezone);

  await audit(cid, {
    actorId: employeeId,
    actorRole: "EMPLOYEE",
    action: "attendance.punch",
    resourceType: "punches",
    resourceId: payload.id,
    after: { type: payload.type, method: payload.method, serverValidated, invalidReason },
  });

  return punchToDto(payload.id, doc);
}
