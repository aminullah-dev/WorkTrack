import { describe, it, expect } from "vitest";
import {
  addDays,
  GRACE_DAYS,
  isDueForPurge,
  NOT_SCHEDULED,
  type CompanyDeletion,
} from "./companyDeletion";

function scheduled(purgeAfter: string | null): CompanyDeletion {
  return {
    status: "SCHEDULED",
    requestedAt: "2026-08-01T00:00:00.000Z",
    requestedBy: "admin",
    purgeAfter,
    reason: null,
  };
}

describe("grace period arithmetic", () => {
  it("lands thirty days later", () => {
    expect(addDays("2026-08-01", GRACE_DAYS)).toBe("2026-08-31");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-08-25", 30)).toBe("2026-09-24");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-27", 3)).toBe("2028-03-01");
  });

  it("does not drift across a daylight-saving change", () => {
    // Adding 24h in local time would lose or repeat an hour and could land a
    // day early — which here means deleting a company a day too soon.
    const tz = process.env.TZ;
    try {
      process.env.TZ = "America/Toronto";
      expect(addDays("2027-03-01", 30)).toBe("2027-03-31");
    } finally {
      process.env.TZ = tz;
    }
  });
});

/**
 * Everything below decides whether a tenant's payroll history is destroyed.
 * The rule is deliberately strict: anything that is not an explicit, matured,
 * scheduled request is a refusal.
 */
describe("is this company due for purge", () => {
  it("purges once the grace period has elapsed", () => {
    expect(isDueForPurge(scheduled("2026-08-31"), "2026-08-31")).toBe(true);
    expect(isDueForPurge(scheduled("2026-08-31"), "2026-09-05")).toBe(true);
  });

  it("refuses the day before", () => {
    expect(isDueForPurge(scheduled("2026-08-31"), "2026-08-30")).toBe(false);
  });

  it("refuses a company nobody asked to close", () => {
    expect(isDueForPurge(NOT_SCHEDULED, "2030-01-01")).toBe(false);
  });

  it("refuses a scheduled record with no date on it", () => {
    expect(isDueForPurge(scheduled(null), "2030-01-01")).toBe(false);
  });

  it("refuses a record whose status was corrupted to something else", () => {
    const odd = { ...scheduled("2026-01-01"), status: "PENDING" as unknown as "SCHEDULED" };
    expect(isDueForPurge(odd, "2030-01-01")).toBe(false);
  });

  it("refuses an empty object rather than treating it as permission", () => {
    expect(isDueForPurge({} as CompanyDeletion, "2030-01-01")).toBe(false);
  });

  it("compares dates as dates, not as strings that happen to sort", () => {
    // ISO dates sort correctly, but only zero-padded. Guard the padded form.
    expect(isDueForPurge(scheduled("2026-09-01"), "2026-08-31")).toBe(false);
    expect(isDueForPurge(scheduled("2026-09-01"), "2026-09-01")).toBe(true);
  });

  it("gives a full thirty days from the request", () => {
    const requested = "2026-08-01";
    const due = addDays(requested, GRACE_DAYS);
    expect(isDueForPurge(scheduled(due), addDays(requested, GRACE_DAYS - 1))).toBe(false);
    expect(isDueForPurge(scheduled(due), due)).toBe(true);
  });
});
