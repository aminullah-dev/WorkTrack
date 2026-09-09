/**
 * Salary advances, and how they come back out of a payslip.
 *
 * In an Afghan business a worker taking money mid-month is the rule, not the
 * exception. With nowhere to record it the accountant keeps a notebook and
 * subtracts by hand at the end of the month — which is the job this product
 * was bought to remove, and the place where a worker's pay is most likely to
 * be wrong with nobody able to prove it either way.
 *
 * Everything here is pure. Payroll arithmetic is the one part of this system
 * that takes money away from people, so the rules are written where they can
 * be argued with in a test rather than discovered on a payslip.
 */

export interface OutstandingAdvance {
  id: string;
  /** Still owed, in the company's currency. Never negative. */
  balance: number;
  /**
   * What to take per pay period. Null means "take it all at the next payroll",
   * which is what a small advance a few days before payday should do.
   */
  instalment: number | null;
  /** ISO date the advance was given. Repayment order is oldest first. */
  issuedOn: string;
}

export interface Repayment {
  advanceId: string;
  amount: number;
  /** What is still owed after this payslip. Zero means it is settled. */
  remaining: number;
}

export interface RepaymentPlan {
  repayments: Repayment[];
  total: number;
  /**
   * True when pay could not cover everything due this period, so some of it
   * rolls into next month. Worth surfacing: it usually means the advances were
   * larger than the job can repay, which somebody should look at rather than
   * discover three months running.
   */
  shortfall: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How much of each advance to take from this payslip.
 *
 * Three rules, and the third is the one that matters:
 *
 *   1. Never more than is owed. An instalment larger than the remaining
 *      balance settles the advance and stops.
 *
 *   2. Oldest first. Any order gives the same total, but a stable one means an
 *      employee can be told which debt a deduction paid, and two runs of the
 *      same month produce the same payslip.
 *
 *   3. Never more than the pay can bear. If somebody had a bad month — unpaid
 *      absence, a short month — the deduction is reduced to what is left and
 *      the rest stays outstanding. The alternatives are both wrong: a negative
 *      payslip, or silently writing off money the company is owed. This is
 *      also the humane answer, because the floor it protects is the worker's
 *      pay reaching zero rather than going below it.
 *
 * `payAvailable` is what the payslip would otherwise pay out — gross less
 * every other deduction. Advances come last on purpose: tax is owed to the
 * state on what was earned, and an advance is the company's own money coming
 * back, so it is the thing that yields when there is not enough to go round.
 */
export function planRepayments(
  advances: readonly OutstandingAdvance[],
  payAvailable: number,
): RepaymentPlan {
  const budget = Math.max(0, round2(payAvailable));
  let left = budget;
  const repayments: Repayment[] = [];
  let anyUnpaid = false;

  const ordered = [...advances]
    .filter((a) => a.balance > 0)
    .sort((a, b) => (a.issuedOn === b.issuedOn ? a.id.localeCompare(b.id) : a.issuedOn.localeCompare(b.issuedOn)));

  for (const advance of ordered) {
    const due = round2(Math.min(advance.instalment ?? advance.balance, advance.balance));
    const take = round2(Math.min(due, left));

    if (take < due) anyUnpaid = true;
    if (take <= 0) {
      // No pay left. Say so rather than recording a zero repayment, which
      // would read on a payslip as "we took nothing off this debt today"
      // dressed up as a transaction.
      continue;
    }

    repayments.push({ advanceId: advance.id, amount: take, remaining: round2(advance.balance - take) });
    left = round2(left - take);
  }

  return {
    repayments,
    total: round2(repayments.reduce((sum, r) => sum + r.amount, 0)),
    shortfall: anyUnpaid,
  };
}

/**
 * The balance an advance is left with after a repayment is recorded.
 *
 * Trivial, and separate because it is the number the next payroll run reads.
 * Getting it wrong by a rounding error compounds every month until somebody is
 * paying off an afghani forever.
 */
export function balanceAfter(balance: number, repaid: number): number {
  return Math.max(0, round2(balance - repaid));
}
