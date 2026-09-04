import { Timestamp } from "firebase-admin/firestore";
import { nowTimestamp, tenant, toIso } from "../lib/firestore";

/** How far past a day's end a session started that day may still close. */
const OVERNIGHT_LOOKAHEAD_MS = 12 * 60 * 60 * 1000;

export interface PunchDoc {
  companyId: string;
  employeeId: string;
  punchedAt: Timestamp;
  type: "IN" | "OUT";
  method: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  geofenceId: string | null;
  insideFence: boolean;
  kioskId: string | null;
  note: string | null;
  selfie?: string | null;
  /** Server-derived: true only when the punch carried a valid face token. */
  faceVerified?: boolean;
  /** Set when the company expects face verification and this punch lacked it. */
  needsReview?: boolean;
  reviewReason?: string | null;
  serverValidated: boolean;
  invalidReason: string | null;
  updatedAt: Timestamp;
}

export function punchToDto(id: string, doc: PunchDoc): Record<string, unknown> {
  return {
    id,
    companyId: doc.companyId,
    employeeId: doc.employeeId,
    punchedAt: toIso(doc.punchedAt),
    type: doc.type,
    method: doc.method,
    latitude: doc.latitude,
    longitude: doc.longitude,
    accuracyMeters: doc.accuracyMeters,
    geofenceId: doc.geofenceId,
    insideFence: doc.insideFence,
    note: doc.note,
    faceVerified: doc.faceVerified ?? false,
    needsReview: doc.needsReview ?? false,
    reviewReason: doc.reviewReason ?? null,
    serverValidated: doc.serverValidated,
    invalidReason: doc.invalidReason,
    updatedAt: toIso(doc.updatedAt),
  };
}

/**
 * Recomputes the AttendanceDay projection for one employee/date from the raw
 * punch stream. Runs after each accepted punch; shift matching, late/overtime
 * math against shift grace windows is applied when an assignment exists.
 */
export async function recomputeAttendanceDay(
  cid: string,
  employeeId: string,
  dateIso: string,
  timezone: string,
): Promise<void> {
  // The day is keyed by the company's calendar date, so its window has to be
  // that date's local midnight — not UTC midnight. In Kabul (UTC+4:30) a UTC
  // window would start at 04:30 local, dropping every night-shift punch made
  // between midnight and dawn from the very day it belongs to.
  const dayStart = localTimeToUtc(dateIso, "00:00", timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // A night shift clocks out after midnight, which is the NEXT day's window. A
  // work session belongs to the day it started, so the read reaches past the
  // boundary to find the closing punch; punches that open a session after the
  // boundary are left to the day they actually belong to.
  const lookaheadEnd = new Date(dayEnd.getTime() + OVERNIGHT_LOOKAHEAD_MS);
  const punchesSnap = await tenant(cid, "punches")
    .where("employeeId", "==", employeeId)
    .where("punchedAt", ">=", Timestamp.fromDate(dayStart))
    .where("punchedAt", "<", Timestamp.fromDate(lookaheadEnd))
    .orderBy("punchedAt", "asc")
    .get();

  const allPunches = punchesSnap.docs.map((d) => d.data() as PunchDoc);
  const ownedByDay = (p: PunchDoc): boolean => p.punchedAt.toMillis() < dayEnd.getTime();
  const punches = allPunches.filter((p) => p.serverValidated);

  // Punches the server refused (outside the geofence, bad device clock, …) are
  // kept as evidence but excluded from the worked-time math above. Summarise
  // them onto the day so the portal can show WHY a day looks empty, instead of
  // silently reading as "absent" with no explanation anywhere.
  const rejected = allPunches.filter((p) => ownedByDay(p) && !p.serverValidated);
  const rejectedCount = rejected.length;
  // Ordered by punchedAt asc, so this is the earliest refusal of the day.
  const rejectedReason = rejected[0]?.invalidReason ?? null;
  const rejectedAt = rejected[0]?.punchedAt ?? null;

  let workedMinutes = 0;
  let firstInAt: Timestamp | null = null;
  let lastOutAt: Timestamp | null = null;
  let openIn: Timestamp | null = null;
  let checkInSelfie: string | null = null;
  let checkInFaceVerified = false;
  // Any unverified punch in the day is worth a manager's attention, not just
  // the first one — someone could verify at check-in and not at check-out.
  let needsReview = false;
  for (const punch of punches) {
    const owned = ownedByDay(punch);
    if (owned && punch.needsReview) needsReview = true;
    if (punch.type === "IN") {
      // An arrival past the boundary starts the next day, not this one.
      if (!owned) break;
      if (!firstInAt) {
        firstInAt = punch.punchedAt;
        checkInSelfie = punch.selfie ?? null; // the day carries the check-in photo
        checkInFaceVerified = punch.faceVerified ?? false;
      }
      if (!openIn) openIn = punch.punchedAt;
    } else if (openIn) {
      workedMinutes += Math.floor(
        (punch.punchedAt.toMillis() - openIn.toMillis()) / 60_000,
      );
      lastOutAt = punch.punchedAt;
      openIn = null;
    }
  }

  // Shift-aware late/early metrics when a roster assignment exists.
  const assignmentSnap = await tenant(cid, "shiftAssignments")
    .where("employeeId", "==", employeeId)
    .where("date", "==", dateIso)
    .limit(1)
    .get();

  let shiftId: string | null = null;
  let lateMinutes = 0;
  let earlyOutMinutes = 0;
  let overtimeMinutes = 0;

  if (!assignmentSnap.empty && firstInAt) {
    const assignment = assignmentSnap.docs[0].data() as { shiftId: string };
    shiftId = assignment.shiftId;
    const shiftDoc = await tenant(cid, "shifts").doc(shiftId).get();
    if (shiftDoc.exists) {
      const shift = shiftDoc.data() as {
        startTime: string; // HH:mm in branch-local time
        endTime: string;
        graceInMinutes: number;
        graceOutMinutes: number;
        breakMinutes: number;
      };
      const shiftStart = localTimeToUtc(dateIso, shift.startTime, timezone);
      let shiftEnd = localTimeToUtc(dateIso, shift.endTime, timezone);
      // 22:00–06:00 ends the next morning. Without this the scheduled length is
      // negative, and every worked minute is counted as overtime.
      if (shiftEnd.getTime() <= shiftStart.getTime()) {
        shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
      }

      const lateBy = Math.floor((firstInAt.toMillis() - shiftStart.getTime()) / 60_000);
      lateMinutes = Math.max(0, lateBy - shift.graceInMinutes);

      if (lastOutAt) {
        const earlyBy = Math.floor((shiftEnd.getTime() - lastOutAt.toMillis()) / 60_000);
        earlyOutMinutes = Math.max(0, earlyBy - shift.graceOutMinutes);

        const scheduled =
          Math.floor((shiftEnd.getTime() - shiftStart.getTime()) / 60_000) - shift.breakMinutes;
        overtimeMinutes = Math.max(0, workedMinutes - scheduled);
      }
    }
  }

  // Someone who has checked in counts as PRESENT while their session is still
  // open (currently at work). Only a completed day under half the standard
  // hours is HALF_DAY. No valid check-in stays PENDING (counts as absent).
  const stillCheckedIn = openIn !== null;
  const status = firstInAt
    ? (stillCheckedIn || workedMinutes >= 240 ? "PRESENT" : "HALF_DAY")
    : "PENDING";

  const dayId = `${employeeId}_${dateIso}`;
  await tenant(cid, "attendanceDays")
    .doc(dayId)
    .set({
      employeeId,
      date: dateIso,
      shiftId,
      firstInAt,
      lastOutAt,
      workedMinutes,
      lateMinutes,
      earlyOutMinutes,
      overtimeMinutes,
      status,
      checkInSelfie,
      checkInFaceVerified,
      needsReview,
      rejectedCount,
      rejectedReason,
      rejectedAt,
      computedAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
}

/**
 * Converts a local wall-clock HH:mm on a date to a UTC Date using the IANA
 * timezone, correct across DST via Intl (no external tz library needed).
 */
export function localTimeToUtc(dateIso: string, hhmm: string, timezone: string): Date {
  const [hours, minutes] = hhmm.split(":").map((v) => Number.parseInt(v, 10));
  const naive = new Date(`${dateIso}T${hhmm.padStart(5, "0")}:00Z`);
  // Offset of the target zone at that moment, in minutes.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(naive).map((p) => [p.type, p.value]),
  );
  const zoned = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
  );
  const offsetMillis = zoned - naive.getTime();
  return new Date(
    Date.UTC(
      Number(dateIso.slice(0, 4)),
      Number(dateIso.slice(5, 7)) - 1,
      Number(dateIso.slice(8, 10)),
      hours,
      minutes,
    ) - offsetMillis,
  );
}

/**
 * The seven dates of the working week containing [dateIso], Saturday first.
 *
 * Afghanistan works Saturday through Thursday with Friday off, so a week
 * starting on Monday would split every working week across two reports.
 * Operates on plain date strings, which carry no timezone to get wrong.
 */
export function weekOf(dateIso: string): string[] {
  const anchor = new Date(`${dateIso}T00:00:00Z`);
  // getUTCDay: Sunday=0 … Saturday=6, so this is "days since Saturday".
  const sinceSaturday = (anchor.getUTCDay() + 1) % 7;
  const saturday = new Date(anchor.getTime() - sinceSaturday * 86_400_000);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(saturday.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Local calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function localDateOf(at: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at); // en-CA yields YYYY-MM-DD
}
