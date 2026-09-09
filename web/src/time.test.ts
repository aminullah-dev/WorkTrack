import { describe, it, expect, vi, afterEach } from "vitest";
import { isoTodayIn, isViewerDayDifferent } from "./time";

afterEach(() => {
  vi.useRealTimers();
});

describe("company calendar day", () => {
  it("resolves the company's day, not the viewer's or UTC", () => {
    vi.useFakeTimers();
    // Evening of the 26th in Ottawa is already the morning of the 27th in Kabul.
    vi.setSystemTime(new Date("2026-07-27T00:23:53Z"));
    expect(isoTodayIn("Asia/Kabul")).toBe("2026-07-27");
    expect(isoTodayIn("America/Toronto")).toBe("2026-07-26");
  });

  it("agrees with UTC only when the offset does not cross midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
    expect(isoTodayIn("Asia/Kabul")).toBe("2026-07-26");
    expect(isoTodayIn("America/Toronto")).toBe("2026-07-26");
  });

  it("handles Kabul's half-hour offset across the boundary", () => {
    vi.useFakeTimers();
    // 19:45 UTC is 00:15 on the 27th in Kabul (UTC+4:30).
    vi.setSystemTime(new Date("2026-07-26T19:45:00Z"));
    expect(isoTodayIn("Asia/Kabul")).toBe("2026-07-27");
  });

  it("does not flag a viewer who is already in the company's zone", () => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(isViewerDayDifferent(local)).toBe(false);
  });
});
