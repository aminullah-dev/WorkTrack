import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { isValidUlid } from "../lib/ids";
import { audit, nowTimestamp, tenant, toIso } from "../lib/firestore";

export const regularizationCreateSchema = z.object({
  id: z.string().length(26),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedInAt: z.string().datetime().nullish(),
  requestedOutAt: z.string().datetime().nullish(),
  reason: z.string().min(1).max(1000),
});

export type RegularizationCreate = z.infer<typeof regularizationCreateSchema>;

export const regularizationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).nullish(),
});

interface RegularizationDoc {
  companyId: string;
  employeeId: string;
  employeeName: string | null;
  date: string;
  requestedInAt: Timestamp | null;
  requestedOutAt: Timestamp | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentApproverId: string | null;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function regularizationToDto(id: string, d: RegularizationDoc): Record<string, unknown> {
  return {
    id,
    companyId: d.companyId,
    employeeId: d.employeeId,
    employeeName: d.employeeName,
    date: d.date,
    requestedInAt: toIso(d.requestedInAt),
    requestedOutAt: toIso(d.requestedOutAt),
    reason: d.reason,
    status: d.status,
    currentApproverId: d.currentApproverId,
    decidedAt: toIso(d.decidedAt),
    decisionNote: d.decisionNote,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

/** Employee-filed request to correct a day's attendance. Idempotent on the ULID. */
export async function createRegularization(
  cid: string,
  employeeId: string,
  payload: RegularizationCreate,
): Promise<Record<string, unknown>> {
  if (!isValidUlid(payload.id)) {
    throw ApiError.validation("Request id must be a ULID", { id: "Invalid ULID" });
  }
  if (!payload.requestedInAt && !payload.requestedOutAt) {
    throw ApiError.validation("Provide a corrected check-in or check-out time", {
      requestedInAt: "Required",
    });
  }

  const ref = tenant(cid, "regularizations").doc(payload.id);
  const existing = await ref.get();
  if (existing.exists) {
    return regularizationToDto(payload.id, existing.data() as RegularizationDoc);
  }

  const empSnap = await tenant(cid, "employees").doc(employeeId).get();
  const emp = empSnap.data() as
    | { firstName?: string; lastName?: string; managerId?: string | null }
    | undefined;

  const now = nowTimestamp();
  const doc: RegularizationDoc = {
    companyId: cid,
    employeeId,
    employeeName: emp ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : null,
    date: payload.date,
    requestedInAt: payload.requestedInAt ? Timestamp.fromDate(new Date(payload.requestedInAt)) : null,
    requestedOutAt: payload.requestedOutAt ? Timestamp.fromDate(new Date(payload.requestedOutAt)) : null,
    reason: payload.reason,
    status: "PENDING",
    currentApproverId: emp?.managerId ?? null,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.create(doc);
  return regularizationToDto(payload.id, doc);
}

/** Approve/reject. On approval the corrected times are written to the day. */
export async function decideRegularization(
  cid: string,
  id: string,
  decidedBy: string,
  roles: string[],
  decision: "APPROVE" | "REJECT",
  note: string | null,
): Promise<Record<string, unknown>> {
  const ref = tenant(cid, "regularizations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw ApiError.notFound("Regularization not found");
  }
  const reg = snap.data() as RegularizationDoc;
  if (reg.status !== "PENDING") {
    throw ApiError.business(ErrorCodes.INVALID_STATE, `Already ${reg.status}`);
  }
  const isAssigned = reg.currentApproverId === decidedBy;
  const isAdmin = roles.includes("HR_ADMIN") || roles.includes("COMPANY_ADMIN");
  if (!isAssigned && !isAdmin) {
    throw ApiError.permissionDenied("You are not the approver for this request");
  }
  if (reg.employeeId === decidedBy) {
    throw ApiError.permissionDenied("You cannot decide your own request");
  }

  if (decision === "APPROVE") {
    await applyToAttendanceDay(cid, reg);
  }

  const now = nowTimestamp();
  await ref.update({
    status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
    decidedAt: now,
    decidedBy,
    decisionNote: note,
    currentApproverId: null,
    updatedAt: now,
  });

  await audit(cid, {
    actorId: decidedBy,
    actorRole: roles.join(","),
    action: `attendance.regularization.${decision.toLowerCase()}`,
    resourceType: "regularizations",
    resourceId: id,
    after: { decision, date: reg.date },
  });

  return regularizationToDto(id, { ...reg, status: decision === "APPROVE" ? "APPROVED" : "REJECTED" });
}

/**
 * Writes the approved correction onto the AttendanceDay projection. A manager
 * approved these times, so no lateness penalty is applied; worked minutes come
 * straight from the corrected in/out. (Shift-aware late recompute for corrected
 * days is a future refinement.)
 */
async function applyToAttendanceDay(cid: string, reg: RegularizationDoc): Promise<void> {
  const dayId = `${reg.employeeId}_${reg.date}`;
  const inAt = reg.requestedInAt;
  const outAt = reg.requestedOutAt;

  let workedMinutes = 0;
  if (inAt && outAt) {
    workedMinutes = Math.max(0, Math.floor((outAt.toMillis() - inAt.toMillis()) / 60_000));
  }
  const status = workedMinutes >= 240 ? "PRESENT" : workedMinutes > 0 ? "HALF_DAY" : "PENDING";

  const now = nowTimestamp();
  const ref = tenant(cid, "attendanceDays").doc(dayId);

  // A correction amends the day; it does not replace it. A full set() built
  // only from the requested times wiped the check-in photo, the face-verified
  // flag, the review flags and the record of refused punches — and a request
  // that supplied only one of the two times zeroed the other and the worked
  // total with it. Only the fields the correction actually decides are written.
  const patch: Record<string, unknown> = {
    regularized: true,
    computedAt: now,
    updatedAt: now,
  };
  if (inAt) patch.firstInAt = inAt;
  if (outAt) patch.lastOutAt = outAt;
  // Worked time and status are only recomputed when both ends are known;
  // a one-sided correction leaves the existing figures alone.
  if (inAt && outAt) {
    patch.workedMinutes = workedMinutes;
    patch.status = status;
    patch.lateMinutes = 0;
    patch.earlyOutMinutes = 0;
    patch.overtimeMinutes = 0;
  }
  await ref.set(patch, { merge: true });
}
