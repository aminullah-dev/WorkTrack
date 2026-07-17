import { Timestamp } from "firebase-admin/firestore";
import { nowTimestamp, tenant, toIso } from "../lib/firestore";

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
  const dayStart = new Date(`${dateIso}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const punchesSnap = await tenant(cid, "punches")
    .where("employeeId", "==", employeeId)
    .where("punchedAt", ">=", Timestamp.fromDate(dayStart))
    .where("punchedAt", "<", Timestamp.fromDate(dayEnd))
    .orderBy("punchedAt", "asc")
    .get();

  const punches = punchesSnap.docs
    .map((d) => d.data() as PunchDoc)
    .filter((p) => p.serverValidated);

  let workedMinutes = 0;
  let firstInAt: Timestamp | null = null;
  let lastOutAt: Timestamp | null = null;
  let openIn: Timestamp | null = null;
  for (const punch of punches) {
    if (punch.type === "IN") {
      if (!firstInAt) firstInAt = punch.punchedAt;
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
      const shiftEnd = localTimeToUtc(dateIso, shift.endTime, timezone);

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

  const status = firstInAt ? (workedMinutes >= 240 ? "PRESENT" : "HALF_DAY") : "PENDING";

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
      computedAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });
}

/**
 * Converts a local wall-clock HH:mm on a date to a UTC Date using the IANA
 * timezone, correct across DST via Intl (no external tz library needed).
 */
function localTimeToUtc(dateIso: string, hhmm: string, timezone: string): Date {
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
