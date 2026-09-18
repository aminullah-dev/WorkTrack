import { describe, it, expect } from "vitest";
import { addDays, addMonths, daysBetween } from "./dates";

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("goes backwards", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("addMonths", () => {
  it("keeps the day of the month", () => {
    expect(addMonths("2026-09-17", 1)).toBe("2026-10-17");
    expect(addMonths("2026-09-17", 12)).toBe("2027-09-17");
  });

  it("clamps to the end of a shorter month", () => {
    // A term bought on the 31st must not roll into the 3rd of March.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("crosses the year", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("daysBetween", () => {
  it("counts forwards and backwards", () => {
    expect(daysBetween("2026-09-17", "2026-09-24")).toBe(7);
    expect(daysBetween("2026-09-24", "2026-09-17")).toBe(-7);
    expect(daysBetween("2026-09-17", "2026-09-17")).toBe(0);
  });
});
