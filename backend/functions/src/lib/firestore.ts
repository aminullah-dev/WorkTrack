import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { CollectionReference, Firestore } from "firebase-admin/firestore";

// Self-contained initialization keeps module import order irrelevant.
if (getApps().length === 0) {
  initializeApp();
}

export const db: Firestore = getFirestore();

/** Sub-collections of companies/{cid}. Names match the client's ResourceTypes. */
export type TenantCollection =
  | "branches"
  | "departments"
  | "positions"
  | "employees"
  | "roleAssignments"
  | "devices"
  | "geofences"
  | "shifts"
  | "shiftAssignments"
  | "punches"
  | "attendanceDays"
  | "regularizations"
  | "leaveTypes"
  | "leavePolicies"
  | "leaveBalances"
  | "leaveRequests"
  | "holidayCalendars"
  | "salaryComponents"
  | "salaryStructures"
  | "employeeSalaries"
  | "payrollRuns"
  | "payslips"
  | "announcements"
  | "documents"
  | "auditLogs"
  | "notifications"
  | "idempotencyKeys";

export function tenant(cid: string, collection: TenantCollection): CollectionReference {
  return db.collection("companies").doc(cid).collection(collection);
}

/** ISO string for wire DTOs from a stored Firestore Timestamp. */
export function toIso(value: Timestamp | undefined | null): string | null {
  return value ? value.toDate().toISOString() : null;
}

export function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

/** Appends an immutable audit log entry. Never awaited on the hot path fails soft. */
export async function audit(
  cid: string,
  entry: {
    actorId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  try {
    await tenant(cid, "auditLogs").add({
      ...entry,
      before: entry.before ?? null,
      after: entry.after ?? null,
      at: nowTimestamp(),
    });
  } catch (e) {
    // Audit failures must not fail the business operation, but they are loud.
    console.error("AUDIT_WRITE_FAILED", { cid, action: entry.action, error: e });
  }
}
