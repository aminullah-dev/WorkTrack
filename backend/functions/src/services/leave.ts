import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { isValidUlid } from "../lib/ids";
import { audit, db, nowTimestamp, tenant, toIso } from "../lib/firestore";

export const leaveCreateSchema = z.object({
  id: z.string().length(26),
  leaveTypeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHalfDay: z.boolean().optional().default(false),
  endHalfDay: z.boolean().optional().default(false),
  reason: z.string().min(1).max(1000),
});

export type LeaveCreate = z.infer<typeof leaveCreateSchema>;

export const leaveDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(1000).nullish(),
});

interface LeaveRequestDoc {
  companyId: string;
  employeeId: string;
  employeeName: string | null;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentApproverId: string | null;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
  decisionNote: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function leaveRequestToDto(id: string, doc: LeaveRequestDoc): Record<string, unknown> {
  return {
    id,
    companyId: doc.companyId,
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    leaveTypeId: doc.leaveTypeId,
    startDate: doc.startDate,
    endDate: doc.endDate,
    startHalfDay: doc.startHalfDay,
    endHalfDay: doc.endHalfDay,
    days: doc.days,
    reason: doc.reason,
    status: doc.status,
    currentApproverId: doc.currentApproverId,
    decidedAt: toIso(doc.decidedAt),
    decisionNote: doc.decisionNote,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

/** Calendar-day count with half-day trims; must match the client's estimate. */
export function calculateDays(payload: LeaveCreate): number {
  const start = new Date(`${payload.startDate}T00:00:00Z`);
  const end = new Date(`${payload.endDate}T00:00:00Z`);
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (span <= 0) {
    return 0;
  }
  if (span === 1) {
    return payload.startHalfDay || payload.endHalfDay ? 0.5 : 1;
  }
  let days = span;
  if (payload.startHalfDay) days -= 0.5;
  if (payload.endHalfDay) days -= 0.5;
  return days;
}

/**
 * Creates a leave request transactionally: validates the authoritative balance,
 * reserves pendingDays, and routes to the employee's manager for approval.
 * Idempotent on the client-generated ULID.
 */
export async function createLeaveRequest(
  cid: string,
  employeeId: string,
  payload: LeaveCreate,
): Promise<Record<string, unknown>> {
  if (!isValidUlid(payload.id)) {
    throw ApiError.validation("Request id must be a ULID", { id: "Invalid ULID" });
  }
  const days = calculateDays(payload);
  if (days <= 0) {
    throw ApiError.validation("End date must be on or after start date", {
      endDate: "Invalid range",
    });
  }

  const requestRef = tenant(cid, "leaveRequests").doc(payload.id);
  const periodYear = Number(payload.startDate.slice(0, 4));

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(requestRef);
    if (existing.exists) {
      return leaveRequestToDto(payload.id, existing.data() as LeaveRequestDoc);
    }

    const employeeSnap = await tx.get(tenant(cid, "employees").doc(employeeId));
    if (!employeeSnap.exists) {
      throw ApiError.notFound("Employee record not found");
    }
    const employee = employeeSnap.data() as {
      firstName?: string;
      lastName?: string;
      managerId?: string | null;
    };

    const balanceQuery = tenant(cid, "leaveBalances")
      .where("employeeId", "==", employeeId)
      .where("leaveTypeId", "==", payload.leaveTypeId)
      .where("periodYear", "==", periodYear)
      .limit(1);
    const balanceSnap = await tx.get(balanceQuery);

    // No balance row used to mean no limit, and POST /employees never created
    // one — so every employee added through the portal had unlimited leave.
    // Absence of an entitlement is now a refusal, not a free pass.
    if (balanceSnap.empty) {
      throw ApiError.business(
        ErrorCodes.INSUFFICIENT_LEAVE_BALANCE,
        "No leave entitlement is configured for this employee and leave type",
      );
    }
    {
      const balance = balanceSnap.docs[0].data() as {
        entitledDays: number;
        accruedDays: number;
        usedDays: number;
        carriedOverDays: number;
        pendingDays: number;
      };
      const available =
        balance.entitledDays +
        balance.accruedDays +
        balance.carriedOverDays -
        balance.usedDays -
        balance.pendingDays;
      if (days > available) {
        throw ApiError.business(
          ErrorCodes.INSUFFICIENT_LEAVE_BALANCE,
          `Requested ${days} days but only ${available.toFixed(1)} available`,
        );
      }
      tx.update(balanceSnap.docs[0].ref, {
        pendingDays: balance.pendingDays + days,
        updatedAt: nowTimestamp(),
      });
    }

    const now = nowTimestamp();
    const doc: LeaveRequestDoc = {
      companyId: cid,
      employeeId,
      employeeName:
        [employee.firstName, employee.lastName].filter(Boolean).join(" ") || null,
      leaveTypeId: payload.leaveTypeId,
      startDate: payload.startDate,
      endDate: payload.endDate,
      startHalfDay: payload.startHalfDay,
      endHalfDay: payload.endHalfDay,
      days,
      reason: payload.reason,
      status: "PENDING",
      currentApproverId: employee.managerId ?? null,
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(requestRef, doc);
    return leaveRequestToDto(payload.id, doc);
  });
}

/** Approves or rejects a PENDING request; moves the pendingDays reservation. */
export async function decideLeaveRequest(
  cid: string,
  requestId: string,
  decidedBy: string,
  deciderRoles: string[],
  decision: "APPROVE" | "REJECT",
  note: string | null,
): Promise<Record<string, unknown>> {
  const requestRef = tenant(cid, "leaveRequests").doc(requestId);

  const dto = await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) {
      throw ApiError.notFound("Leave request not found");
    }
    const request = snap.data() as LeaveRequestDoc;
    if (request.status !== "PENDING") {
      throw ApiError.business(ErrorCodes.INVALID_STATE, `Request is already ${request.status}`);
    }

    const isAssignedApprover = request.currentApproverId === decidedBy;
    const isAdmin = deciderRoles.includes("HR_ADMIN") || deciderRoles.includes("COMPANY_ADMIN");
    if (!isAssignedApprover && !isAdmin) {
      throw ApiError.permissionDenied("You are not the approver for this request");
    }
    if (request.employeeId === decidedBy) {
      throw ApiError.permissionDenied("You cannot decide your own leave request");
    }

    const periodYear = Number(request.startDate.slice(0, 4));
    const balanceQuery = tenant(cid, "leaveBalances")
      .where("employeeId", "==", request.employeeId)
      .where("leaveTypeId", "==", request.leaveTypeId)
      .where("periodYear", "==", periodYear)
      .limit(1);
    const balanceSnap = await tx.get(balanceQuery);

    if (!balanceSnap.empty) {
      const balance = balanceSnap.docs[0].data() as { pendingDays: number; usedDays: number };
      const releasedPending = Math.max(0, balance.pendingDays - request.days);
      tx.update(balanceSnap.docs[0].ref, {
        pendingDays: releasedPending,
        usedDays: decision === "APPROVE" ? balance.usedDays + request.days : balance.usedDays,
        updatedAt: nowTimestamp(),
      });
    }

    const updated: Partial<LeaveRequestDoc> = {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decidedAt: nowTimestamp(),
      decidedBy,
      decisionNote: note,
      currentApproverId: null,
      updatedAt: nowTimestamp(),
    };
    tx.update(requestRef, updated);
    return leaveRequestToDto(requestId, { ...request, ...updated } as LeaveRequestDoc);
  });

  // Approving leave used to touch nothing but the request itself, so the person
  // on approved leave still showed as ABSENT on the attendance board, the
  // dashboard's on-leave tile stayed at zero, and payroll's paidLeaveDays was
  // always zero. Mark the days so all three read the truth.
  if (decision === "APPROVE") {
    await markLeaveDays(cid, dto);
  }

  await audit(cid, {
    actorId: decidedBy,
    actorRole: deciderRoles.join(","),
    action: `leave.${decision.toLowerCase()}`,
    resourceType: "leaveRequests",
    resourceId: requestId,
    after: { decision, note },
  });
  return dto;
}

/** Owner-initiated cancellation of a PENDING request; releases the reservation. */
export async function cancelLeaveRequest(
  cid: string,
  requestId: string,
  employeeId: string,
): Promise<Record<string, unknown>> {
  const requestRef = tenant(cid, "leaveRequests").doc(requestId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) {
      throw ApiError.notFound("Leave request not found");
    }
    const request = snap.data() as LeaveRequestDoc;
    if (request.employeeId !== employeeId) {
      throw ApiError.permissionDenied("Only the requester can cancel");
    }
    if (request.status !== "PENDING") {
      throw ApiError.business(ErrorCodes.INVALID_STATE, `Request is already ${request.status}`);
    }

    const periodYear = Number(request.startDate.slice(0, 4));
    const balanceSnap = await tx.get(
      tenant(cid, "leaveBalances")
        .where("employeeId", "==", request.employeeId)
        .where("leaveTypeId", "==", request.leaveTypeId)
        .where("periodYear", "==", periodYear)
        .limit(1),
    );
    if (!balanceSnap.empty) {
      const balance = balanceSnap.docs[0].data() as { pendingDays: number };
      tx.update(balanceSnap.docs[0].ref, {
        pendingDays: Math.max(0, balance.pendingDays - request.days),
        updatedAt: nowTimestamp(),
      });
    }

    const updated: Partial<LeaveRequestDoc> = {
      status: "CANCELLED",
      currentApproverId: null,
      updatedAt: nowTimestamp(),
    };
    tx.update(requestRef, updated);
    return leaveRequestToDto(requestId, { ...request, ...updated } as LeaveRequestDoc);
  });
}

/**
 * Stamps LEAVE onto each attendance day the approved request covers.
 *
 * Merged, not replaced: a day may already carry punches (someone who worked a
 * half day before going home) and that evidence is not the approval's to erase.
 */
async function markLeaveDays(cid: string, dto: Record<string, unknown>): Promise<void> {
  const employeeId = String(dto.employeeId ?? "");
  const startDate = String(dto.startDate ?? "");
  const endDate = String(dto.endDate ?? "");
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return;
  }

  const now = nowTimestamp();
  const batch = db.batch();
  let written = 0;
  for (
    let d = new Date(`${startDate}T00:00:00Z`);
    d <= new Date(`${endDate}T00:00:00Z`) && written < 120; // a sane upper bound
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dateIso = d.toISOString().slice(0, 10);
    batch.set(
      tenant(cid, "attendanceDays").doc(`${employeeId}_${dateIso}`),
      {
        employeeId,
        date: dateIso,
        status: "LEAVE",
        leaveRequestId: dto.id ?? null,
        updatedAt: now,
      },
      { merge: true },
    );
    written++;
  }
  if (written > 0) {
    await batch.commit();
  }
}
