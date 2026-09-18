import { describe, it, expect } from "vitest";
import {
  addDays,
  assertSpan,
  canSetStatus,
  expandAssignees,
  nextWorkingDay,
  taskRunsOn,
} from "./work";

/**
 * The scheduling rules, without a database.
 *
 * These are the parts that decide what an employee is told he is doing
 * tomorrow, so they are tested against the Afghan working week (Friday off)
 * rather than a Monday-to-Friday one.
 */

const FRIDAY_OFF = [5]; // ISO weekday: Friday
const NO_HOLIDAYS = new Set<string>();

describe("expandAssignees", () => {
  it("puts a crew and the extra man on the same task", () => {
    expect(expandAssignees(["e_spark"], ["e_ali", "e_omar"])).toEqual([
      "e_ali",
      "e_omar",
      "e_spark",
    ]);
  });

  it("counts somebody named twice once", () => {
    // Otherwise array-contains returns his task twice and he sees it twice.
    expect(expandAssignees(["e_ali"], ["e_ali", "e_omar"])).toEqual(["e_ali", "e_omar"]);
  });

  it("is order-independent, so the same assignment compares equal", () => {
    expect(expandAssignees(["b", "a"])).toEqual(expandAssignees(["a", "b"]));
  });

  it("an individual assignment is just a team of one", () => {
    expect(expandAssignees(["e_ali"])).toEqual(["e_ali"]);
  });
});

describe("taskRunsOn", () => {
  const span = { startDate: "2026-09-05", endDate: "2026-09-09", assigneeIds: [] };

  it("includes both endpoints", () => {
    expect(taskRunsOn(span, "2026-09-05")).toBe(true);
    expect(taskRunsOn(span, "2026-09-09")).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(taskRunsOn(span, "2026-09-04")).toBe(false);
    expect(taskRunsOn(span, "2026-09-10")).toBe(false);
  });

  it("a single-day task runs on its one day", () => {
    const day = { startDate: "2026-09-07", endDate: "2026-09-07", assigneeIds: [] };
    expect(taskRunsOn(day, "2026-09-07")).toBe(true);
    expect(taskRunsOn(day, "2026-09-08")).toBe(false);
  });
});

describe("nextWorkingDay", () => {
  it("is tomorrow on an ordinary day", () => {
    // 2026-09-07 is a Monday.
    expect(nextWorkingDay("2026-09-07", FRIDAY_OFF, NO_HOLIDAYS)).toBe("2026-09-08");
  });

  it("skips Friday, so Thursday's answer is Saturday", () => {
    // This is the case the feature exists for. 2026-09-10 is a Thursday; a
    // literal "tomorrow" would show an empty Friday and the employee would
    // conclude he has nothing on.
    expect(nextWorkingDay("2026-09-10", FRIDAY_OFF, NO_HOLIDAYS)).toBe("2026-09-12");
  });

  it("skips a holiday too", () => {
    expect(nextWorkingDay("2026-09-07", FRIDAY_OFF, new Set(["2026-09-08"]))).toBe("2026-09-09");
  });

  it("skips a holiday that falls on the day after a weekend", () => {
    expect(
      nextWorkingDay("2026-09-10", FRIDAY_OFF, new Set(["2026-09-12", "2026-09-13"])),
    ).toBe("2026-09-14");
  });

  it("gives up rather than guessing when the company is closed for a fortnight", () => {
    const shut = new Set(
      Array.from({ length: 20 }, (_, i) => addDays("2026-09-07", i + 1)),
    );
    expect(nextWorkingDay("2026-09-07", FRIDAY_OFF, shut)).toBeNull();
  });

  it("crosses a month and a year boundary", () => {
    expect(nextWorkingDay("2026-09-30", FRIDAY_OFF, NO_HOLIDAYS)).toBe("2026-10-01");
    // 2027-01-01 is itself a Friday, so the answer from Thursday the 31st is
    // Saturday the 2nd — the weekend rule wins over the year boundary.
    expect(nextWorkingDay("2026-12-31", FRIDAY_OFF, NO_HOLIDAYS)).toBe("2027-01-02");
  });

  it("honours a company that rests on Friday and Saturday", () => {
    // 2026-09-10 is a Thursday; with both days off the answer is Sunday.
    expect(nextWorkingDay("2026-09-10", [5, 6], NO_HOLIDAYS)).toBe("2026-09-13");
  });
});

describe("addDays", () => {
  it("crosses month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("goes backwards", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("assertSpan", () => {
  it("accepts a single day and a normal span", () => {
    expect(() => assertSpan("2026-09-07", "2026-09-07")).not.toThrow();
    expect(() => assertSpan("2026-09-07", "2026-09-20")).not.toThrow();
  });

  it("refuses an end before the start", () => {
    expect(() => assertSpan("2026-09-07", "2026-09-06")).toThrow(/end date is before/i);
  });

  it("refuses a task that would sit on every day for years", () => {
    expect(() => assertSpan("2026-01-01", "2028-01-01")).toThrow(/more than a year/i);
  });
});

describe("canSetStatus", () => {
  const task = { assigneeIds: ["e_ali", "e_omar"] };

  it("lets the man doing the work say how it is going", () => {
    expect(canSetStatus(task, "e_ali", false)).toBe(true);
  });

  it("does not let a colleague close somebody else's work", () => {
    expect(canSetStatus(task, "e_fatima", false)).toBe(false);
  });

  it("lets a planner close anything", () => {
    expect(canSetStatus(task, "e_fatima", true)).toBe(true);
  });
});
