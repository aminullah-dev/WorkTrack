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
  // One working calendar per company, keyed by the Gregorian date, so saving
  // the same day twice corrects it rather than double-counting. The original
  // design allowed several named calendars per tenant; nothing has needed that,
  // and a second calendar can be added later without moving these documents.
  | "holidays"
  | "salaryComponents"
  // Money handed to somebody before payday, and taken back out of it. Kept as
  // a principal plus a subcollection of repayments keyed by the payroll run
  // that made them, because a run can be recomputed and a mutated balance
  // would take the same month's money twice. See services/advanceStore.ts.
  | "advances"
  // What a piece-rate worker finished, and when. One document per entry rather
  // than a running total per month, because a total nobody can break down is a
  // total nobody can dispute — and disputes about piece counts are the whole
  // reason a workshop keeps a book. See services/pieceWork.ts.
  | "pieceRecords"
  // Which of those components apply to one person, and at what amount. A
  // component is a definition; this is the exception list against it — an
  // allowance only some people get, a different figure for one of them, or a
  // company-wide allowance withheld from one. Keyed `employeeId__componentId`
  // so assigning twice corrects rather than duplicates.
  | "employeeComponents"
  | "salaryStructures"
  | "employeeSalaries"
  | "payrollRuns"
  | "payslips"
  | "expenses"
  | "accounts"
  | "journalEntries"
  | "announcements"
  // What the company is building, who is on which crew, and the individual
  // pieces of work scheduled against a date. See services/work.ts.
  | "projects"
  | "projectTeams"
  | "tasks"
  // Tazkira, contract, work permit, health certificate — the papers a company
  // has to hold for each person, and when each of them runs out. The entry
  // existed and nothing used it; see services/employeeDocuments.ts.
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
