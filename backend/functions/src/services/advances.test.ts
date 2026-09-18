import { describe, it, expect } from "vitest";
import { planRepayments, balanceAfter, type OutstandingAdvance } from "./advances";

function advance(over: Partial<OutstandingAdvance> = {}): OutstandingAdvance {
  return { id: "a1", balance: 5000, instalment: null, issuedOn: "2026-09-01", ...over };
}

describe("taking an advance back out of a payslip", () => {
  it("takes the whole thing when no instalment was set", () => {
    // A small advance a few days before payday: the default is to settle it at
    // the next payroll rather than dribble it out.
    const plan = planRepayments([advance({ balance: 5000 })], 20000);

    expect(plan.total).toBe(5000);
    expect(plan.repayments[0].remaining).toBe(0);
    expect(plan.shortfall).toBe(false);
  });

  it("takes the instalment when one was agreed", () => {
    const plan = planRepayments([advance({ balance: 12000, instalment: 3000 })], 20000);

    expect(plan.total).toBe(3000);
    expect(plan.repayments[0].remaining).toBe(9000);
  });

  it("never takes more than is owed", () => {
    // The last instalment of a nearly-settled advance.
    const plan = planRepayments([advance({ balance: 800, instalment: 3000 })], 20000);

    expect(plan.total).toBe(800);
    expect(plan.repayments[0].remaining).toBe(0);
  });

  it("takes only what the pay can bear, and leaves the rest owing", () => {
    // A bad month — unpaid absence ate the wage. Deducting the full instalment
    // would make the payslip negative; forgiving it would write off the
    // company's money without anybody deciding to.
    const plan = planRepayments([advance({ balance: 10000, instalment: 4000 })], 1500);

    expect(plan.total).toBe(1500);
    expect(plan.repayments[0].remaining).toBe(8500);
    expect(plan.shortfall).toBe(true);
  });

  it("takes nothing at all when there is nothing to take", () => {
    const plan = planRepayments([advance({ balance: 10000, instalment: 4000 })], 0);

    // Not a zero-amount repayment: on a payslip that reads as a transaction
    // that happened, and it did not.
    expect(plan.repayments).toEqual([]);
    expect(plan.total).toBe(0);
    expect(plan.shortfall).toBe(true);
  });

  it("never returns a negative repayment when pay is already negative", () => {
    const plan = planRepayments([advance()], -500);

    expect(plan.total).toBe(0);
    expect(plan.repayments).toEqual([]);
  });
});

describe("more than one advance", () => {
  const two = [
    advance({ id: "new", balance: 3000, issuedOn: "2026-09-05" }),
    advance({ id: "old", balance: 2000, issuedOn: "2026-08-01" }),
  ];

  it("pays the oldest debt first", () => {
    // Any order gives the same total. A stable one means an employee can be
    // told which debt a deduction paid, and a re-run produces the same payslip.
    const plan = planRepayments(two, 100000);

    expect(plan.repayments.map((r) => r.advanceId)).toEqual(["old", "new"]);
    expect(plan.total).toBe(5000);
  });

  it("stops when the money runs out, mid-way through the queue", () => {
    const plan = planRepayments(two, 2500);

    expect(plan.repayments).toEqual([
      { advanceId: "old", amount: 2000, remaining: 0 },
      { advanceId: "new", amount: 500, remaining: 2500 },
    ]);
    expect(plan.shortfall).toBe(true);
  });

  it("breaks a tie on issue date by id, so a re-run is identical", () => {
    const sameDay = [
      advance({ id: "b", balance: 1000, issuedOn: "2026-09-01" }),
      advance({ id: "a", balance: 1000, issuedOn: "2026-09-01" }),
    ];

    expect(planRepayments(sameDay, 100000).repayments.map((r) => r.advanceId)).toEqual(["a", "b"]);
  });

  it("ignores advances already settled", () => {
    const plan = planRepayments([advance({ id: "done", balance: 0 }), advance({ id: "live" })], 100000);

    expect(plan.repayments.map((r) => r.advanceId)).toEqual(["live"]);
  });

  it("does no work and reports no shortfall when there is nothing outstanding", () => {
    expect(planRepayments([], 20000)).toEqual({ repayments: [], total: 0, shortfall: false });
  });
});

describe("the arithmetic itself", () => {
  it("keeps to two decimals so a balance cannot drift", () => {
    // Left unrounded, a third of a balance compounds every month until
    // somebody is repaying a fraction of an afghani forever.
    const plan = planRepayments([advance({ balance: 1000, instalment: 333.333 })], 20000);

    expect(plan.repayments[0].amount).toBe(333.33);
    expect(plan.repayments[0].remaining).toBe(666.67);
  });

  it("settles exactly, with nothing left behind", () => {
    let balance = 1000;
    for (let month = 0; month < 3; month += 1) {
      const plan = planRepayments([advance({ balance, instalment: 333.34 })], 20000);
      balance = balanceAfter(balance, plan.total);
    }
    expect(balance).toBe(0);
  });

  it("never lets a balance go below zero", () => {
    expect(balanceAfter(100, 250)).toBe(0);
  });
});
