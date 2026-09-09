import { ApiError, ErrorCodes } from "../lib/errors";
import { nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { balanceAfter, type OutstandingAdvance, type Repayment } from "./advances";

/**
 * Storing advances, and taking them back a payroll run at a time.
 *
 * The shape is driven by one fact about payroll: a run can be recomputed.
 * Payslip ids are derived from the run and the journal entry overwrites in
 * place, so re-running a month is a supported, ordinary thing to do — and an
 * advance repayment that simply subtracted from a balance would take the money
 * twice for one month's pay.
 *
 * So a repayment is not an event that mutates a balance. It is a record keyed
 * by the run that caused it, and the balance is derived:
 *
 *     outstanding = principal − sum(repayments)
 *
 * Recomputing a month rewrites that month's repayment in place and everything
 * else follows. Asking for the balance while computing run X deliberately
 * ignores X's own repayment, so the run sees the month as it was before it
 * touched anything, however many times it is run.
 */

export interface AdvanceDoc {
  employeeId: string;
  employeeName: string;
  principal: number;
  instalment: number | null;
  issuedOn: string;
  note: string | null;
  /** Derived; kept on the document so a list does not have to sum subcollections. */
  repaid: number;
  status: "OUTSTANDING" | "SETTLED" | "CANCELLED";
  createdBy: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export function advanceToDto(id: string, doc: AdvanceDoc): Record<string, unknown> {
  return {
    id,
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    principal: doc.principal,
    instalment: doc.instalment,
    issuedOn: doc.issuedOn,
    note: doc.note,
    repaid: doc.repaid,
    outstanding: balanceAfter(doc.principal, doc.repaid),
    status: doc.status,
  };
}

export async function createAdvance(
  cid: string,
  input: {
    employeeId: string;
    principal: number;
    instalment: number | null;
    issuedOn: string;
    note: string | null;
  },
  createdBy: string,
): Promise<{ id: string; doc: AdvanceDoc }> {
  const employee = await tenant(cid, "employees").doc(input.employeeId).get();
  if (!employee.exists) {
    throw ApiError.notFound("Employee not found");
  }
  const e = employee.data() as { firstName?: string; lastName?: string };

  const now = nowTimestamp();
  const doc: AdvanceDoc = {
    employeeId: input.employeeId,
    employeeName: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim(),
    principal: input.principal,
    instalment: input.instalment,
    issuedOn: input.issuedOn,
    note: input.note,
    repaid: 0,
    status: "OUTSTANDING",
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const id = ulid();
  await tenant(cid, "advances").doc(id).create(doc);
  return { id, doc };
}

/**
 * Cancels an advance that should not have been recorded.
 *
 * Cancelling, not deleting: money that was handed to somebody and then written
 * off is exactly the transaction an audit needs to still be able to see. An
 * advance that has already had something repaid cannot be cancelled at all,
 * because the repayment happened and the payslip that made it is issued.
 */
export async function cancelAdvance(cid: string, id: string): Promise<void> {
  const ref = tenant(cid, "advances").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Advance not found");
  const doc = snap.data() as AdvanceDoc;

  if (doc.repaid > 0) {
    throw ApiError.business(
      ErrorCodes.INVALID_STATE,
      "Some of this advance has already been repaid; it cannot be cancelled",
    );
  }
  await ref.update({ status: "CANCELLED", updatedAt: nowTimestamp() });
}

/**
 * What each of these employees still owes, as the given run should see it.
 *
 * `excludeRunId` is what makes a recomputation safe: the balances come back as
 * they were before this run last touched them, so running the same month twice
 * takes the same money once.
 */
export async function outstandingFor(
  cid: string,
  employeeIds: readonly string[],
  excludeRunId: string | null,
): Promise<Map<string, OutstandingAdvance[]>> {
  const byEmployee = new Map<string, OutstandingAdvance[]>();
  if (employeeIds.length === 0) return byEmployee;

  // SETTLED ones are included on purpose. A previous attempt at THIS run may
  // be what settled them, and excluding them here would make a recomputation
  // silently forgive the debt: the run would see nothing owing, deduct
  // nothing, and the reconciliation below would then delete the repayment that
  // had paid it off. Only CANCELLED is genuinely out of scope. What is
  // actually settled falls out below, once the balance is adjusted for this
  // run's own repayment.
  const snap = await tenant(cid, "advances")
    .where("status", "in", ["OUTSTANDING", "SETTLED"])
    .get();
  const wanted = new Set(employeeIds);

  await Promise.all(
    snap.docs.map(async (advanceDoc) => {
      const doc = advanceDoc.data() as AdvanceDoc;
      if (!wanted.has(doc.employeeId)) return;

      let repaid = doc.repaid;
      if (excludeRunId) {
        const mine = await advanceDoc.ref.collection("repayments").doc(excludeRunId).get();
        if (mine.exists) {
          repaid = balanceAfter(repaid, (mine.data() as { amount: number }).amount);
        }
      }

      const balance = balanceAfter(doc.principal, repaid);
      if (balance <= 0) return;

      const list = byEmployee.get(doc.employeeId) ?? [];
      list.push({
        id: advanceDoc.id,
        balance,
        instalment: doc.instalment,
        issuedOn: doc.issuedOn,
      });
      byEmployee.set(doc.employeeId, list);
    }),
  );

  return byEmployee;
}

/**
 * Brings this run's repayment records in line with what it just decided.
 *
 * Reconciles rather than appends, over every advance the run CONSIDERED — not
 * only the ones it took money from. A recomputation can legitimately repay
 * less than last time, or nothing at all, because attendance was corrected and
 * the pay no longer covers it. Writing only the new repayments would leave the
 * previous, larger one in place and the employee would still be shown as
 * having paid it.
 *
 * The record id is the run id, so the second run of a month replaces the first
 * run's record instead of adding to it. `repaid` is then recomputed from the
 * records that remain rather than incremented — an increment applied twice is
 * the exact bug this whole design exists to prevent.
 */
export async function reconcileRepayments(
  cid: string,
  runId: string,
  periodLabel: string,
  consideredAdvanceIds: readonly string[],
  repayments: readonly Repayment[],
): Promise<void> {
  const byAdvance = new Map(repayments.map((r) => [r.advanceId, r]));

  await Promise.all(
    consideredAdvanceIds.map(async (advanceId) => {
      const ref = tenant(cid, "advances").doc(advanceId);
      const recordRef = ref.collection("repayments").doc(runId);
      const repayment = byAdvance.get(advanceId);

      if (repayment) {
        await recordRef.set({
          runId,
          period: periodLabel,
          amount: repayment.amount,
          at: nowTimestamp(),
        });
      } else {
        await recordRef.delete().catch(() => undefined);
      }

      const all = await ref.collection("repayments").get();
      const repaid =
        Math.round(
          all.docs.reduce((sum, d) => sum + ((d.data() as { amount?: number }).amount ?? 0), 0) * 100,
        ) / 100;

      const snap = await ref.get();
      const principal = (snap.data() as AdvanceDoc | undefined)?.principal ?? 0;
      await ref.update({
        repaid,
        status: balanceAfter(principal, repaid) <= 0 ? "SETTLED" : "OUTSTANDING",
        updatedAt: nowTimestamp(),
      });
    }),
  );
}
