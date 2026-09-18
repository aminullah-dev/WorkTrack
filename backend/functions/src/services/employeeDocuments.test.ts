import { describe, it, expect } from "vitest";
import { daysBetween, standingOf } from "./employeeDocuments";

/**
 * How a document stands on a given day.
 *
 * The expensive case this exists for is not a document that is missing — it is
 * one that quietly ran out four months ago, which means somebody has been
 * working without a valid contract and the company cannot answer for it.
 */

const TODAY = "2026-09-09";

describe("standing", () => {
  it("is valid while there is time", () => {
    const s = standingOf("2027-01-01", TODAY);
    expect(s.standing).toBe("VALID");
    expect(s.daysLeft).toBe(114);
  });

  it("warns inside the window", () => {
    expect(standingOf("2026-10-01", TODAY).standing).toBe("EXPIRING");
    expect(standingOf("2026-09-10", TODAY).standing).toBe("EXPIRING");
  });

  it("treats today as still expiring, not yet expired", () => {
    // A contract is valid ON the day it expires. Calling it expired sends
    // somebody home a day early.
    const s = standingOf(TODAY, TODAY);
    expect(s.standing).toBe("EXPIRING");
    expect(s.daysLeft).toBe(0);
  });

  it("counts an expired one in negative days, so a list can sort by urgency", () => {
    const s = standingOf("2026-05-01", TODAY);
    expect(s.standing).toBe("EXPIRED");
    expect(s.daysLeft).toBeLessThan(0);
  });

  it("says a tazkira does not expire rather than pretending it is valid", () => {
    // NO_EXPIRY and VALID are different facts. A register that shows every
    // permanent document as "valid, 0 days" teaches people to ignore the
    // column.
    expect(standingOf(null, TODAY).standing).toBe("NO_EXPIRY");
    expect(standingOf(undefined, TODAY).daysLeft).toBeNull();
  });

  it("respects a different warning window", () => {
    expect(standingOf("2026-11-01", TODAY, 30).standing).toBe("VALID");
    expect(standingOf("2026-11-01", TODAY, 90).standing).toBe("EXPIRING");
  });

  it("does not fall over on a date nobody can parse", () => {
    expect(standingOf("not-a-date", TODAY).standing).toBe("EXPIRING");
    expect(daysBetween("x", TODAY)).toBe(0);
  });
});

describe("counting days", () => {
  it("counts whole days each way", () => {
    expect(daysBetween("2026-09-09", "2026-09-10")).toBe(1);
    expect(daysBetween("2026-09-09", "2026-09-08")).toBe(-1);
    expect(daysBetween("2026-09-09", "2026-09-09")).toBe(0);
  });

  it("crosses a month and a year without drifting", () => {
    expect(daysBetween("2026-12-25", "2027-01-01")).toBe(7);
    // 2028 is a leap year: February has 29 days.
    expect(daysBetween("2028-02-01", "2028-03-01")).toBe(29);
  });
});
