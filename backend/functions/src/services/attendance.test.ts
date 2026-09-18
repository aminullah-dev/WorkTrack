import { describe, it, expect } from "vitest";
import { localDateOf, localTimeToUtc, weekOf } from "./attendance";

/**
 * The company-calendar maths behind attendance. Every bug found in this area
 * has been a timezone boundary, so each case below is one of them, pinned:
 *
 *  - a day filed under the viewer's date instead of the company's
 *  - a day window built from UTC midnight instead of local midnight, which
 *    dropped night-shift punches from the day they were worked
 *
 * Kabul is UTC+4:30 — a half-hour offset, which is exactly the kind that
 * hour-based arithmetic gets wrong.
 */

const KABUL = "Asia/Kabul";
const OTTAWA = "America/Toronto";

describe("localDateOf — which calendar day a punch belongs to", () => {
  it("uses the company's day, not the viewer's", () => {
    // 20:23 in Ottawa on the 26th is already 04:53 on the 27th in Kabul.
    const at = new Date("2026-07-27T00:23:53Z");
    expect(localDateOf(at, KABUL)).toBe("2026-07-27");
    expect(localDateOf(at, OTTAWA)).toBe("2026-07-26");
  });

  it("rolls over at Kabul midnight, not at UTC midnight", () => {
    // 19:29 UTC is 23:59 in Kabul — still the previous day.
    expect(localDateOf(new Date("2026-07-26T19:29:00Z"), KABUL)).toBe("2026-07-26");
    // One minute later it is 00:00 in Kabul, so the day turns over.
    expect(localDateOf(new Date("2026-07-26T19:30:00Z"), KABUL)).toBe("2026-07-27");
  });

  it("agrees with UTC in the middle of the working day", () => {
    expect(localDateOf(new Date("2026-07-26T08:00:00Z"), KABUL)).toBe("2026-07-26");
  });
});

describe("weekOf — the working week a date belongs to", () => {
  // 2026-07-25 is a Saturday; the week runs to Friday 2026-07-31.
  const week = ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"];

  it("starts on Saturday, the first working day here", () => {
    expect(weekOf("2026-07-25")).toEqual(week);
  });

  it("gives the same week from any day inside it", () => {
    // Sunday, midweek, and the Friday that closes it.
    expect(weekOf("2026-07-26")).toEqual(week);
    expect(weekOf("2026-07-28")).toEqual(week);
    expect(weekOf("2026-07-31")).toEqual(week);
  });

  it("rolls to the next week on the following Saturday", () => {
    expect(weekOf("2026-08-01")[0]).toBe("2026-08-01");
  });

  it("crosses a month boundary without breaking", () => {
    const w = weekOf("2026-08-01");
    expect(w).toHaveLength(7);
    expect(w[w.length - 1]).toBe("2026-08-07");
  });

  it("crosses a year boundary without breaking", () => {
    const w = weekOf("2027-01-01"); // a Friday
    expect(w[0]).toBe("2026-12-26");
    expect(w[6]).toBe("2027-01-01");
  });
});

describe("localTimeToUtc — the window a day's punches are read from", () => {
  it("puts local midnight at 19:30 UTC the previous day", () => {
    // This is the fix: a UTC-midnight window would start at 04:30 Kabul and
    // miss everything worked between midnight and dawn.
    expect(localTimeToUtc("2026-07-27", "00:00", KABUL).toISOString()).toBe(
      "2026-07-26T19:30:00.000Z",
    );
  });

  it("covers a night-shift punch made at 01:00 local", () => {
    const start = localTimeToUtc("2026-07-27", "00:00", KABUL);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const punch = new Date("2026-07-26T20:30:00Z"); // 01:00 on the 27th in Kabul

    expect(punch >= start && punch < end).toBe(true);
    // …and it is filed under the same day the window belongs to.
    expect(localDateOf(punch, KABUL)).toBe("2026-07-27");
  });

  it("excludes a punch from the following local day", () => {
    const start = localTimeToUtc("2026-07-27", "00:00", KABUL);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const nextDay = new Date("2026-07-27T20:00:00Z"); // 00:30 on the 28th in Kabul

    expect(nextDay < end).toBe(false);
    expect(localDateOf(nextDay, KABUL)).toBe("2026-07-28");
  });

  it("converts a shift start time, not just midnight", () => {
    // 08:00 Kabul is 03:30 UTC.
    expect(localTimeToUtc("2026-07-26", "08:00", KABUL).toISOString()).toBe(
      "2026-07-26T03:30:00.000Z",
    );
  });

  it("round-trips: local midnight resolves back to its own date", () => {
    for (const date of ["2026-01-01", "2026-07-27", "2026-12-31"]) {
      expect(localDateOf(localTimeToUtc(date, "00:00", KABUL), KABUL)).toBe(date);
    }
  });

  it("handles a zone with daylight saving on both sides of the change", () => {
    // Toronto is UTC-4 in July and UTC-5 in January; the offset must be taken
    // at the instant in question, not assumed.
    expect(localTimeToUtc("2026-07-15", "00:00", OTTAWA).toISOString()).toBe(
      "2026-07-15T04:00:00.000Z",
    );
    expect(localTimeToUtc("2026-01-15", "00:00", OTTAWA).toISOString()).toBe(
      "2026-01-15T05:00:00.000Z",
    );
  });
});
