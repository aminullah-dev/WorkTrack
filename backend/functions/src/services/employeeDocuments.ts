import { ApiError } from "../lib/errors";
import { nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";

/**
 * The papers a company has to hold for each person, and when they run out.
 *
 * A tazkira, an employment contract, a work permit, a health certificate. A
 * firm working for an NGO or a ministry is required to keep these, and the
 * expensive part is not storing them — it is the day somebody's contract
 * expired four months ago and nobody noticed, which means a person has been
 * working without one and the company cannot answer for it.
 *
 * So this is deliberately a REGISTER, not a filing cabinet: what the document
 * is, its number, and the date it stops being valid. The scan itself needs
 * Cloud Storage and a set of access rules that deserve their own decision, and
 * the expiry warning is worth having long before the photograph is.
 */

export const DOCUMENT_TYPES = [
  "TAZKIRA",
  "CONTRACT",
  "WORK_PERMIT",
  "HEALTH_CERTIFICATE",
  "LICENCE",
  "OTHER",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface EmployeeDocumentDoc {
  employeeId: string;
  employeeName: string;
  type: DocumentType;
  /** The number on the paper. Not unique, not validated — it is a label. */
  number: string | null;
  issuedOn: string | null;
  /** Null for a document that does not expire, such as a tazkira. */
  expiresOn: string | null;
  note: string | null;
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export function documentToDto(id: string, doc: EmployeeDocumentDoc): Record<string, unknown> {
  return {
    id,
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    type: doc.type,
    number: doc.number,
    issuedOn: doc.issuedOn,
    expiresOn: doc.expiresOn,
    note: doc.note,
  };
}

/**
 * How a document stands on a given day.
 *
 * Pure, and separate from the storage, because "how many days until this
 * matters" is the only interesting thing about a document and it should be
 * arguable in a test.
 *
 * Both dates are plain `YYYY-MM-DD` and compared as strings, which is correct
 * for ISO dates and avoids inventing a timezone for a piece of paper: a
 * contract does not expire at midnight in Kabul, it expires on a date.
 */
export type DocumentStanding = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

export function standingOf(
  expiresOn: string | null | undefined,
  todayIso: string,
  warnWithinDays = 30,
): { standing: DocumentStanding; daysLeft: number | null } {
  if (!expiresOn) return { standing: "NO_EXPIRY", daysLeft: null };

  const days = daysBetween(todayIso, expiresOn);
  if (days < 0) return { standing: "EXPIRED", daysLeft: days };
  if (days <= warnWithinDays) return { standing: "EXPIRING", daysLeft: days };
  return { standing: "VALID", daysLeft: days };
}

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is in the past. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export async function addDocument(
  cid: string,
  input: {
    employeeId: string;
    type: DocumentType;
    number: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
    note: string | null;
  },
  createdBy: string,
): Promise<{ id: string; doc: EmployeeDocumentDoc }> {
  const employee = await tenant(cid, "employees").doc(input.employeeId).get();
  if (!employee.exists) throw ApiError.notFound("Employee not found");
  const e = employee.data() as { firstName?: string; lastName?: string };

  const now = nowTimestamp();
  const doc: EmployeeDocumentDoc = {
    employeeId: input.employeeId,
    employeeName: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
    type: input.type,
    number: input.number,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
    note: input.note,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const id = ulid();
  await tenant(cid, "documents").doc(id).create(doc);
  return { id, doc };
}

export async function deleteDocument(cid: string, id: string): Promise<void> {
  const ref = tenant(cid, "documents").doc(id);
  if (!(await ref.get()).exists) throw ApiError.notFound("Document not found");
  await ref.delete();
}

export async function listDocuments(
  cid: string,
  employeeId: string | null,
): Promise<Record<string, unknown>[]> {
  const base = tenant(cid, "documents");
  const snap = await (employeeId
    ? base.where("employeeId", "==", employeeId).limit(300).get()
    : base.limit(500).get());

  return snap.docs
    .map((d) => documentToDto(d.id, d.data() as EmployeeDocumentDoc))
    .sort((a, b) => String(a.expiresOn ?? "9999").localeCompare(String(b.expiresOn ?? "9999")));
}

/**
 * Documents that have run out, or are about to.
 *
 * Ordered by how urgent they are — the ones already expired first — because a
 * list that buries an expired work permit under thirty upcoming renewals is a
 * list nobody acts on.
 */
export async function expiringDocuments(
  cid: string,
  todayIso: string,
  warnWithinDays = 30,
): Promise<
  (Record<string, unknown> & { standing: DocumentStanding; daysLeft: number | null })[]
> {
  const snap = await tenant(cid, "documents").limit(1000).get();

  return snap.docs
    .map((d) => {
      const doc = d.data() as EmployeeDocumentDoc;
      return { ...documentToDto(d.id, doc), ...standingOf(doc.expiresOn, todayIso, warnWithinDays) };
    })
    .filter((d) => d.standing === "EXPIRED" || d.standing === "EXPIRING")
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}
