import { describe, it, expect } from "vitest";
import {
  classifyDay,
  eachDate,
  expectedWorkingDays,
  isoWeekday,
  shamsiDateToIso,
  solarHolidaysFor,
} from "./calendar";

const NONE = new Set<string>();
const FRIDAY_OFF = [5];

describe("weekday numbering", () => {
  // Off-by-one here would move every company's weekend by a day.
  it("numbers Monday through Sunday as 1..7", () => {
    expect(isoWeekday("2026-08-24")).toBe(1); // Monday
    expect(isoWeekday("2026-08-25")).toBe(2);
    expect(isoWeekday("2026-08-26")).toBe(3);
    expect(isoWeekday("2026-08-27")).toBe(4);
    expect(isoWeekday("2026-08-28")).toBe(5); // Friday
    expect(isoWeekday("2026-08-29")).toBe(6);
    expect(isoWeekday("2026-08-30")).toBe(7); // Sunday
  });

  it("does not drift with the host timezone", () => {
    // A plain date has no zone; reading it in local time would shift the
    // weekday for anyone west of UTC.
    const tz = process.env.TZ;
    try {
      process.env.TZ = "America/Toronto";
      expect(isoWeekday("2026-08-28")).toBe(5);
      process.env.TZ = "Asia/Kabul";
      expect(isoWeekday("2026-08-28")).toBe(5);
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe("date ranges", () => {
  it("includes both ends", () => {
    expect(eachDate("2026-08-24", "2026-08-27")).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27",
    ]);
  });

  it("returns the single day when both ends match", () => {
    expect(eachDate("2026-08-24", "2026-08-24")).toEqual(["2026-08-24"]);
  });

  it("crosses a month boundary", () => {
    expect(eachDate("2026-08-30", "2026-09-02")).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
    ]);
  });

  it("survives a daylight-saving shift without dropping or repeating a day", () => {
    // 2026-03-08 is the US spring-forward. Adding 24h in local time would skip.
    const days = eachDate("2026-03-06", "2026-03-10");
    expect(days).toEqual(["2026-03-06","2026-03-07","2026-03-08","2026-03-09","2026-03-10"]);
    expect(new Set(days).size).toBe(5);
  });
});

describe("classifying a day", () => {
  it("calls Friday a weekend for an Afghan company", () => {
    expect(classifyDay("2026-08-28", FRIDAY_OFF, NONE)).toBe("WEEKEND");
  });

  it("calls an ordinary Tuesday a working day", () => {
    expect(classifyDay("2026-08-25", FRIDAY_OFF, NONE)).toBe("WORKING");
  });

  it("recognises a holiday on a working day", () => {
    expect(classifyDay("2026-08-25", FRIDAY_OFF, new Set(["2026-08-25"]))).toBe("HOLIDAY");
  });

  it("leaves a holiday that falls on the weekend as a weekend", () => {
    // Nobody works either way; the distinction only matters for pay.
    expect(classifyDay("2026-08-28", FRIDAY_OFF, new Set(["2026-08-28"]))).toBe("WEEKEND");
  });

  it("honours a company that works Fridays and rests Sunday", () => {
    expect(classifyDay("2026-08-28", [7], NONE)).toBe("WORKING");
    expect(classifyDay("2026-08-30", [7], NONE)).toBe("WEEKEND");
  });

  it("treats a two-day weekend as two days off", () => {
    expect(classifyDay("2026-08-28", [5, 6], NONE)).toBe("WEEKEND");
    expect(classifyDay("2026-08-29", [5, 6], NONE)).toBe("WEEKEND");
    expect(classifyDay("2026-08-30", [5, 6], NONE)).toBe("WORKING");
  });

  it("treats an empty weekend list as a seven-day week", () => {
    for (const d of eachDate("2026-08-24", "2026-08-30")) {
      expect(classifyDay(d, [], NONE)).toBe("WORKING");
    }
  });
});

describe("expected working days", () => {
  it("drops the weekend from a full week", () => {
    const days = expectedWorkingDays("2026-08-24", "2026-08-30", FRIDAY_OFF, NONE);
    expect(days).toHaveLength(6);
    expect(days).not.toContain("2026-08-28");
  });

  it("drops a holiday as well", () => {
    const days = expectedWorkingDays(
      "2026-08-24", "2026-08-30", FRIDAY_OFF, new Set(["2026-08-25"]),
    );
    expect(days).toHaveLength(5);
    expect(days).not.toContain("2026-08-25");
  });

  it("counts a realistic Afghan working month", () => {
    // 2026-08-01..08-31: 31 days, Fridays on the 7th, 14th, 21st, 28th.
    const days = expectedWorkingDays("2026-08-01", "2026-08-31", FRIDAY_OFF, NONE);
    expect(days).toHaveLength(27);
  });

  it("returns nothing when the whole range is closed", () => {
    expect(expectedWorkingDays("2026-08-28", "2026-08-28", FRIDAY_OFF, NONE)).toEqual([]);
  });
});

describe("Afghan solar holidays", () => {
  it("puts Nawroz on the first day of the Shamsi year", () => {
    // 1 Hamal 1405 is 21 March 2026.
    expect(shamsiDateToIso(1405, 1, 1)).toBe("2026-03-21");
  });

  it("puts Independence Day on 28 Asad", () => {
    expect(shamsiDateToIso(1405, 5, 28)).toBe("2026-08-19");
  });

  it("generates both for a year, marked as recurring", () => {
    const hs = solarHolidaysFor(1405);
    expect(hs.map((h) => h.date)).toEqual(["2026-03-21", "2026-08-19"]);
    expect(hs.every((h) => h.source === "SOLAR_RECURRING" && h.paid)).toBe(true);
  });

  it("moves with the year rather than repeating a fixed Gregorian date", () => {
    const a = solarHolidaysFor(1405)[0].date;
    const b = solarHolidaysFor(1406)[0].date;
    expect(a).not.toBe(b);
    expect(b > a).toBe(true);
  });

  it("does not invent the lunar holidays", () => {
    // Eid dates are announced by moon sighting; a computed date would be wrong
    // often enough to dock pay for a day people were told was a holiday.
    const names = solarHolidaysFor(1405).map((h) => h.nameEn.toLowerCase());
    expect(names.some((n) => n.includes("eid"))).toBe(false);
  });
});
