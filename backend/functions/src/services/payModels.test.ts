import { describe, it, expect } from "vitest";
import { earnedBasic, isPayModel, rateLabelKey } from "./payModels";

describe("a monthly salary", () => {
  it("is paid whole, and absence is deducted from it afterwards", () => {
    // Unchanged behaviour: this is what every existing company is on.
    const r = earnedBasic({ model: "MONTHLY", rate: 30000, workedDays: 16 });
    expect(r.amount).toBe(30000);
    expect(r.chargeUnpaidAbsence).toBe(true);
  });

  it("does not care how many days were worked", () => {
    expect(earnedBasic({ model: "MONTHLY", rate: 30000, workedDays: 0 }).amount).toBe(30000);
    expect(earnedBasic({ model: "MONTHLY", rate: 30000, workedDays: 26 }).amount).toBe(30000);
  });
});

describe("a daily wage", () => {
  it("pays for the days that were worked", () => {
    expect(earnedBasic({ model: "DAILY", rate: 700, workedDays: 20 }).amount).toBe(14000);
  });

  it("never also charges for the days that were not", () => {
    // THE point of this module. A daily worker absent ten days is paid for the
    // twenty they came and owes nothing for the ten. Deducting on top takes
    // those days twice, and somebody absent half the month goes home with
    // nothing at all.
    expect(earnedBasic({ model: "DAILY", rate: 700, workedDays: 10 }).chargeUnpaidAbsence).toBe(
      false,
    );
  });

  it("pays half a day for half a day", () => {
    expect(earnedBasic({ model: "DAILY", rate: 700, workedDays: 15.5 }).amount).toBe(10850);
  });

  it("pays nothing for a month nobody turned up to", () => {
    const r = earnedBasic({ model: "DAILY", rate: 700, workedDays: 0 });
    expect(r.amount).toBe(0);
    // And still charges nothing, so the payslip is zero rather than negative.
    expect(r.chargeUnpaidAbsence).toBe(false);
  });
});

describe("piece work", () => {
  it("pays for what was finished", () => {
    expect(earnedBasic({ model: "PIECE", rate: 120, workedDays: 22, pieces: 340 }).amount).toBe(
      40800,
    );
  });

  it("ignores the days entirely", () => {
    // Somebody who finished in three days is owed for the work; somebody who
    // sat all month and finished nothing is owed nothing. That is the bargain
    // this model exists to express.
    const fast = earnedBasic({ model: "PIECE", rate: 120, workedDays: 3, pieces: 340 });
    const slow = earnedBasic({ model: "PIECE", rate: 120, workedDays: 26, pieces: 340 });
    expect(fast.amount).toBe(slow.amount);
    expect(earnedBasic({ model: "PIECE", rate: 120, workedDays: 26, pieces: 0 }).amount).toBe(0);
  });

  it("never charges absence either", () => {
    expect(
      earnedBasic({ model: "PIECE", rate: 120, workedDays: 2, pieces: 10 }).chargeUnpaidAbsence,
    ).toBe(false);
  });

  it("treats a missing count as nothing finished, not as an error", () => {
    expect(earnedBasic({ model: "PIECE", rate: 120, workedDays: 22 }).amount).toBe(0);
  });
});

describe("records that predate this", () => {
  it("pays an unknown or absent model as a monthly salary", () => {
    // Every existing company is monthly. The alternative to this default is a
    // payroll run that refuses to pay anybody.
    for (const model of [null, undefined, "", "SOMETHING_ELSE"]) {
      const r = earnedBasic({ model, rate: 30000, workedDays: 16 });
      expect(r.amount, `model=${String(model)}`).toBe(30000);
      expect(r.chargeUnpaidAbsence).toBe(true);
    }
  });
});

describe("guarding the arithmetic", () => {
  it("never returns a negative wage", () => {
    expect(earnedBasic({ model: "DAILY", rate: -700, workedDays: 20 }).amount).toBe(0);
    expect(earnedBasic({ model: "DAILY", rate: 700, workedDays: -5 }).amount).toBe(0);
  });

  it("survives a rate that is not a number", () => {
    expect(earnedBasic({ model: "MONTHLY", rate: NaN, workedDays: 16 }).amount).toBe(0);
  });

  it("keeps to two decimals", () => {
    expect(earnedBasic({ model: "DAILY", rate: 333.333, workedDays: 3 }).amount).toBe(1000);
  });
});

describe("saying what a rate is a rate for", () => {
  it("labels each model differently", () => {
    // "30,000" against a daily worker is a fortune and against a monthly one is
    // a salary. The label is not decoration.
    const keys = new Set(["MONTHLY", "DAILY", "PIECE"].map(rateLabelKey));
    expect(keys.size).toBe(3);
  });

  it("falls back to the monthly label for an unknown model", () => {
    expect(rateLabelKey(null)).toBe(rateLabelKey("MONTHLY"));
  });
});

describe("recognising a model", () => {
  it("accepts the three and nothing else", () => {
    expect(isPayModel("DAILY")).toBe(true);
    expect(isPayModel("daily")).toBe(false);
    expect(isPayModel(null)).toBe(false);
  });
});
