import { ApiError } from "../lib/errors";
import { nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";

/**
 * What a piece-rate worker finished.
 *
 * A tailoring workshop pays per garment, so payroll needs a count for the
 * period. It is kept as one document per entry — "40 on the 3rd", "35 on the
 * 4th" — rather than as a running monthly total, because a total nobody can
 * break down is a total nobody can dispute, and disputes about piece counts
 * are exactly what a workshop's book exists to settle.
 */

export interface PieceRecordDoc {
  employeeId: string;
  employeeName: string;
  /** ISO date the work was completed. */
  date: string;
  quantity: number;
  note: string | null;
  recordedBy: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export function pieceRecordToDto(id: string, doc: PieceRecordDoc): Record<string, unknown> {
  return {
    id,
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    date: doc.date,
    quantity: doc.quantity,
    note: doc.note,
  };
}

export async function recordPieces(
  cid: string,
  input: { employeeId: string; date: string; quantity: number; note: string | null },
  recordedBy: string,
): Promise<{ id: string; doc: PieceRecordDoc }> {
  const employee = await tenant(cid, "employees").doc(input.employeeId).get();
  if (!employee.exists) throw ApiError.notFound("Employee not found");
  const e = employee.data() as { firstName?: string; lastName?: string };

  const doc: PieceRecordDoc = {
    employeeId: input.employeeId,
    employeeName: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
    date: input.date,
    quantity: input.quantity,
    note: input.note,
    recordedBy,
    createdAt: nowTimestamp(),
  };
  const id = ulid();
  await tenant(cid, "pieceRecords").doc(id).create(doc);
  return { id, doc };
}

export async function deletePieceRecord(cid: string, id: string): Promise<void> {
  const ref = tenant(cid, "pieceRecords").doc(id);
  if (!(await ref.get()).exists) throw ApiError.notFound("Record not found");
  await ref.delete();
}

/**
 * How many pieces each person finished between two dates, inclusive.
 *
 * One query for the whole company: a payroll run already reads enough per
 * employee, and a workshop's month is a few hundred rows at most.
 */
export async function piecesByEmployee(
  cid: string,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  const snap = await tenant(cid, "pieceRecords")
    .where("date", ">=", fromIso)
    .where("date", "<=", toIso)
    .get();

  const totals = new Map<string, number>();
  for (const doc of snap.docs) {
    const d = doc.data() as PieceRecordDoc;
    totals.set(d.employeeId, (totals.get(d.employeeId) ?? 0) + (d.quantity ?? 0));
  }
  return totals;
}
