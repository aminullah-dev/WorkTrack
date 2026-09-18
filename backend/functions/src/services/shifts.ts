import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { audit, db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const shiftWriteSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(20),
  startTime: z.string().regex(TIME),
  endTime: z.string().regex(TIME),
  breakMinutes: z.number().int().min(0).max(720).default(0),
  graceInMinutes: z.number().int().min(0).max(180).default(10),
  graceOutMinutes: z.number().int().min(0).max(180).default(10),
  active: z.boolean().default(true),
});

export type ShiftWrite = z.infer<typeof shiftWriteSchema>;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Worked span in minutes. end<=start wraps past midnight; start==end means 24h. */
export function shiftDurationMinutes(start: string, end: string): number {
  const d = toMinutes(end) - toMinutes(start);
  return d <= 0 ? d + 1440 : d;
}

/** True when the shift crosses midnight (night shifts and 24-hour shifts). */
export function shiftCrossesMidnight(start: string, end: string): boolean {
  return toMinutes(end) <= toMinutes(start);
}

interface ShiftDoc {
  companyId: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceInMinutes: number;
  graceOutMinutes: number;
  isNightShift: boolean;
  active: boolean;
  updatedAt: Timestamp;
}

export function shiftToDto(id: string, d: ShiftDoc): Record<string, unknown> {
  return {
    id,
    companyId: d.companyId,
    name: d.name,
    code: d.code,
    startTime: d.startTime,
    endTime: d.endTime,
    breakMinutes: d.breakMinutes,
    graceInMinutes: d.graceInMinutes,
    graceOutMinutes: d.graceOutMinutes,
    isNightShift: d.isNightShift,
    active: d.active,
    updatedAt: toIso(d.updatedAt),
  };
}

export async function listShifts(cid: string): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "shifts").limit(200).get();
  return snap.docs
    .map((doc) => shiftToDto(doc.id, doc.data() as ShiftDoc))
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

function buildShiftDoc(cid: string, payload: ShiftWrite): ShiftDoc {
  return {
    companyId: cid,
    name: payload.name,
    code: payload.code,
    startTime: payload.startTime,
    endTime: payload.endTime,
    breakMinutes: payload.breakMinutes,
    graceInMinutes: payload.graceInMinutes,
    graceOutMinutes: payload.graceOutMinutes,
    isNightShift: shiftCrossesMidnight(payload.startTime, payload.endTime),
    active: payload.active,
    updatedAt: nowTimestamp(),
  };
}

export async function createShift(
  cid: string,
  payload: ShiftWrite,
  actorId: string,
  roles: string[],
): Promise<Record<string, unknown>> {
  const id = ulid();
  const doc = buildShiftDoc(cid, payload);
  await tenant(cid, "shifts").doc(id).set(doc);
  await audit(cid, {
    actorId,
    actorRole: roles.join(","),
    action: "shift.create",
    resourceType: "shifts",
    resourceId: id,
    after: { name: payload.name, startTime: payload.startTime, endTime: payload.endTime },
  });
  return shiftToDto(id, doc);
}

export async function updateShift(
  cid: string,
  id: string,
  payload: ShiftWrite,
  actorId: string,
  roles: string[],
): Promise<Record<string, unknown>> {
  const ref = tenant(cid, "shifts").doc(id);
  if (!(await ref.get()).exists) {
    throw ApiError.notFound("Shift not found");
  }
  const doc = buildShiftDoc(cid, payload);
  await ref.set(doc);
  await audit(cid, {
    actorId,
    actorRole: roles.join(","),
    action: "shift.update",
    resourceType: "shifts",
    resourceId: id,
    after: { name: payload.name, active: payload.active },
  });
  return shiftToDto(id, doc);
}

// ---------------------------------------------------------------- roster

export const rosterAssignSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(200),
  shiftId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().nullish(),
});

export type RosterAssign = z.infer<typeof rosterAssignSchema>;

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (const d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Assigns one shift to a set of employees across a date range. One assignment
 * per employee/day, keyed `${employeeId}_${date}` so re-running is idempotent
 * (a day's assignment is replaced, never duplicated).
 */
export async function assignRoster(
  cid: string,
  payload: RosterAssign,
  actorId: string,
  roles: string[],
): Promise<{ created: number }> {
  const to = payload.to ?? payload.from;
  if (to < payload.from) {
    throw ApiError.validation("`to` must be on or after `from`");
  }
  const days = dateRange(payload.from, to);
  if (days.length > 62) {
    throw ApiError.validation("Roster range cannot exceed 62 days");
  }
  const total = days.length * payload.employeeIds.length;
  if (total > 1000) {
    throw ApiError.validation("Too many assignments in one request (max 1000)");
  }

  const shiftSnap = await tenant(cid, "shifts").doc(payload.shiftId).get();
  if (!shiftSnap.exists) {
    throw ApiError.notFound("Shift not found");
  }

  const now = nowTimestamp();
  const col = tenant(cid, "shiftAssignments");
  let batch = db.batch();
  let ops = 0;
  for (const employeeId of payload.employeeIds) {
    for (const date of days) {
      batch.set(col.doc(`${employeeId}_${date}`), {
        companyId: cid,
        employeeId,
        shiftId: payload.shiftId,
        date,
        branchId: payload.branchId ?? null,
        source: "ROSTER",
        updatedAt: now,
      });
      if (++ops === 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  await audit(cid, {
    actorId,
    actorRole: roles.join(","),
    action: "roster.assign",
    resourceType: "shiftAssignments",
    resourceId: payload.shiftId,
    after: { employees: payload.employeeIds.length, from: payload.from, to },
  });

  return { created: total };
}

/** Roster board for one day: every assigned employee joined to their shift. */
export async function rosterForDate(
  cid: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const [assignmentsSnap, shiftsSnap, employeesSnap] = await Promise.all([
    tenant(cid, "shiftAssignments").where("date", "==", date).limit(500).get(),
    tenant(cid, "shifts").get(),
    tenant(cid, "employees").where("status", "==", "ACTIVE").limit(500).get(),
  ]);

  const shiftName = new Map<string, string>();
  for (const doc of shiftsSnap.docs) {
    shiftName.set(doc.id, (doc.data() as { name?: string }).name ?? doc.id);
  }
  const empName = new Map<string, string>();
  for (const doc of employeesSnap.docs) {
    const e = doc.data() as { firstName?: string; lastName?: string };
    empName.set(doc.id, `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim());
  }

  return assignmentsSnap.docs.map((doc) => {
    const a = doc.data() as { employeeId: string; shiftId: string; branchId?: string | null };
    return {
      id: doc.id,
      employeeId: a.employeeId,
      employeeName: empName.get(a.employeeId) ?? a.employeeId,
      shiftId: a.shiftId,
      shiftName: shiftName.get(a.shiftId) ?? a.shiftId,
      branchId: a.branchId ?? null,
      date,
    };
  });
}
