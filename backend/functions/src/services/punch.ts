import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { isValidUlid } from "../lib/ids";
import { audit, nowTimestamp, tenant } from "../lib/firestore";
import { verifyFaceToken } from "../lib/face-token";
import { haversineMeters, checkGeofence } from "./geo";
import { verifyKioskToken } from "./kiosk";
import { getSettings } from "./settings";
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
  // Optional check-in selfie (small base64 JPEG data URL) for photo-verified
  // attendance. Capped well under the Firestore 1MB doc limit.
  selfie: z.string().max(200_000).nullish(),
  /**
   * Signed proof of a successful /attendance/face/verify. `faceVerified` is
   * derived from this server-side and is never accepted from the client.
   */
  faceToken: z.string().max(200).nullish(),
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
  hmacSecret: string,
): Promise<Record<string, unknown>> {
  if (!isValidUlid(payload.id)) {
    throw ApiError.validation("Punch id must be a ULID", { id: "Invalid ULID" });
  }

  const ref = tenant(cid, "punches").doc(payload.id);
  const existing = await ref.get();
  if (existing.exists) {
    // Idempotent replay: the first write wins. Recompute the day before
    // returning, because a replay almost always means the first attempt stored
    // the punch and then failed while projecting it. Without this the
    // projection is lost for good and the punch never reaches the attendance
    // board, even though the client sees a success and stops retrying.
    const stored = existing.data() as PunchDoc;
    const { profile } = await getSettings(cid);
    await recomputeAttendanceDay(
      cid,
      employeeId,
      localDateOf(stored.punchedAt.toDate(), profile.timezone),
      profile.timezone,
    );
    return punchToDto(payload.id, stored);
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

  // FACE punches are GPS punches with an identity check bolted on, so they go
  // through exactly the same geofence validation — otherwise switching method
  // would be a way to opt out of location rules.
  const isLocatedMethod = payload.method === "GPS" || payload.method === "FACE";
  if (serverValidated && isLocatedMethod) {
    if (payload.latitude == null || payload.longitude == null) {
      throw ApiError.validation(`${payload.method} punches require coordinates`, {
        latitude: `Required for ${payload.method} method`,
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
    const token = payload.kioskToken ? verifyKioskToken(hmacSecret, payload.kioskToken) : null;
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
    // Must be the newest punch BEFORE this one. Taking the newest punch overall
    // compares an offline punch being synced late against a punch that happened
    // after it; the negative interval was floored at one second, turning any
    // backdated punch into an implausible-travel rejection.
    const prevSnap = await tenant(cid, "punches")
      .where("employeeId", "==", employeeId)
      .where("punchedAt", "<", Timestamp.fromDate(punchedAt))
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

  // Face verification is only ever believed when the punch carries a token this
  // server signed after a real match. A missing or stale token does NOT void the
  // punch — attendance must never hinge on a finicky face match — it simply
  // means the punch is not verified, and is flagged below if the company
  // expects verification.
  const faceVerified =
    payload.faceToken != null && verifyFaceToken(hmacSecret, employeeId, payload.faceToken);

  const settings = await getSettings(cid);
  const timezone = settings.profile.timezone;

  // A company that turned face recognition on expects self-service check-ins to
  // be identity-checked. Unverified ones still count, but a manager is told.
  // QR/kiosk punches carry their own presence proof (a rotating token scanned at
  // the device) and MANUAL ones are admin-entered, so neither is flagged here.
  const needsReview =
    settings.features.faceRecognition && isLocatedMethod && !faceVerified;

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
    selfie: payload.selfie ?? null,
    faceVerified,
    needsReview,
    reviewReason: needsReview ? "FACE_NOT_VERIFIED" : null,
    serverValidated,
    invalidReason,
    updatedAt: nowTimestamp(),
  };
  // create() (not set) preserves append-only semantics under write races.
  await ref.create(doc);

  await recomputeAttendanceDay(cid, employeeId, localDateOf(punchedAt, timezone), timezone);

  await audit(cid, {
    actorId: employeeId,
    actorRole: "EMPLOYEE",
    action: "attendance.punch",
    resourceType: "punches",
    resourceId: payload.id,
    after: {
      type: payload.type,
      method: payload.method,
      faceVerified,
      needsReview,
      serverValidated,
      invalidReason,
    },
  });

  return punchToDto(payload.id, doc);
}
