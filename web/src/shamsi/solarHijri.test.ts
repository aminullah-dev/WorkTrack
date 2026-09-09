import { describe, it, expect } from "vitest";
import {
  toShamsi,
  toShamsiFromDate,
  shamsiToIso,
  isShamsiLeapYear,
  shamsiMonthLength,
} from "./solarHijri";

// Known-good conversion pairs are shared with the Android port's SolarHijriTest
// (core/common/.../time/SolarHijriTest.kt) — keep the two in sync.
describe("toShamsi (Gregorian -> Solar Hijri)", () => {
  it("maps Nawruz 1405 to 21 March 2026", () => {
    expect(toShamsi("2026-03-21")).toEqual({ year: 1405, month: 1, day: 1 });
  });

  it("maps a mid-year date (17 Jul 2026 = 26 Saratan 1405)", () => {
    expect(toShamsi("2026-07-17")).toEqual({ year: 1405, month: 4, day: 26 });
  });

  it("maps the Unix epoch (1 Jan 1970 = 11 Jadi 1348)", () => {
    expect(toShamsi("1970-01-01")).toEqual({ year: 1348, month: 10, day: 11 });
  });

  it("uses truncate-toward-zero division for pre-August dates (day before Nawruz)", () => {
    // 20 March 2026 is the last day of 1404 (Hut) — the gm-8 < 0 branch that
    // Math.floor would get wrong.
    expect(toShamsi("2026-03-20")).toEqual({ year: 1404, month: 12, day: 29 });
  });

  it("agrees with toShamsiFromDate for the same calendar day", () => {
    // Construct in local time to match toShamsiFromDate's getFullYear/Month/Date.
    const date = new Date(2026, 6, 17); // July is month index 6
    expect(toShamsiFromDate(date)).toEqual(toShamsi("2026-07-17"));
  });
});

describe("shamsiToIso (Solar Hijri -> Gregorian)", () => {
  it("round-trips Nawruz 1405", () => {
    expect(shamsiToIso({ year: 1405, month: 1, day: 1 })).toBe("2026-03-21");
  });

  it("maps the start of Saratan 1405 to 22 June 2026", () => {
    expect(shamsiToIso({ year: 1405, month: 4, day: 1 })).toBe("2026-06-22");
  });

  it("maps the end of Saratan 1405 (day 31) to 22 July 2026", () => {
    expect(shamsiToIso({ year: 1405, month: 4, day: 31 })).toBe("2026-07-22");
  });

  it("zero-pads month and day", () => {
    expect(shamsiToIso({ year: 1348, month: 10, day: 11 })).toBe("1970-01-01");
  });
});

describe("round trip", () => {
  it("returns the original ISO date across a full Solar Hijri year", () => {
    let date = new Date(Date.UTC(2025, 2, 21)); // 21 Mar 2025 = Nawruz 1404
    for (let i = 0; i < 366; i++) {
      const iso = date.toISOString().slice(0, 10);
      expect(shamsiToIso(toShamsi(iso))).toBe(iso);
      date = new Date(date.getTime() + 86_400_000);
    }
  });
});

describe("isShamsiLeapYear", () => {
  it("classifies known leap and common years", () => {
    expect(isShamsiLeapYear(1403)).toBe(true);
    expect(isShamsiLeapYear(1404)).toBe(false);
    expect(isShamsiLeapYear(1405)).toBe(false);
  });
});

describe("shamsiMonthLength", () => {
  it("gives 31 days for the first six months", () => {
    expect(shamsiMonthLength(1405, 1)).toBe(31);
    expect(shamsiMonthLength(1405, 6)).toBe(31);
  });

  it("gives 30 days for months 7–11", () => {
    expect(shamsiMonthLength(1405, 7)).toBe(30);
    expect(shamsiMonthLength(1405, 11)).toBe(30);
  });

  it("gives 30 days for Hut in a leap year and 29 otherwise", () => {
    expect(shamsiMonthLength(1403, 12)).toBe(30);
    expect(shamsiMonthLength(1404, 12)).toBe(29);
  });
});
