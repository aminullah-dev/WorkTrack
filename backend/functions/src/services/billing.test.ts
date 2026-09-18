import { describe, it, expect } from "vitest";
import { licenseAfterPurchase } from "./billing";
import { DEFAULT_LICENSE } from "./license";
import type { License } from "./license";

const TODAY = "2026-09-17";

function license(over: Partial<License> = {}): License {
  return { ...DEFAULT_LICENSE, ...over };
}

describe("what a purchase does to the licence", () => {
  it("runs from today when nothing is left to run", () => {
    const after = licenseAfterPurchase({
      current: license({ plan: "TRIAL", expiresAt: "2026-09-01" }),
      plan: "SILVER",
      months: 1,
      planDeviceLimit: 75,
      today: TODAY,
    });
    expect(after.plan).toBe("SILVER");
    expect(after.expiresAt).toBe("2026-10-17");
    expect(after.status).toBe("ACTIVE");
  });

  it("carries unused days over when a company renews early", () => {
    // Renewing early is the behaviour we want; charging a week for it teaches
    // customers to renew late instead.
    const after = licenseAfterPurchase({
      current: license({ plan: "SILVER", expiresAt: "2026-10-01" }),
      plan: "SILVER",
      months: 12,
      planDeviceLimit: 75,
      today: TODAY,
    });
    expect(after.expiresAt).toBe("2027-10-01");
  });

  it("raises the seat count to the plan's, and never lowers a negotiated one", () => {
    const upgraded = licenseAfterPurchase({
      current: license({ deviceLimit: 5 }),
      plan: "SILVER",
      months: 1,
      planDeviceLimit: 75,
      today: TODAY,
    });
    expect(upgraded.deviceLimit).toBe(75);

    const negotiated = licenseAfterPurchase({
      current: license({ deviceLimit: 300, plan: "GOLD" }),
      plan: "BRONZE",
      months: 1,
      planDeviceLimit: 20,
      today: TODAY,
    });
    expect(negotiated.deviceLimit).toBe(300);
  });

  it("keeps what the vendor granted by hand", () => {
    const after = licenseAfterPurchase({
      current: license({
        employeeLimit: 40,
        extraFeatures: ["analytics"],
        enforceDevices: true,
      }),
      plan: "BRONZE",
      months: 1,
      planDeviceLimit: 20,
      today: TODAY,
    });
    expect(after.employeeLimit).toBe(40);
    expect(after.extraFeatures).toEqual(["analytics"]);
    expect(after.enforceDevices).toBe(true);
  });

  it("starts metering the plan, and records that the customer paid for it", () => {
    const after = licenseAfterPurchase({
      current: license({ enforcePlan: false, source: "VENDOR" }),
      plan: "GOLD",
      months: 1,
      planDeviceLimit: 500,
      today: TODAY,
    });
    expect(after.enforcePlan).toBe(true);
    expect(after.source).toBe("SELF_SERVE");
  });

  it("revives a suspended licence rather than leaving the payment stranded", () => {
    const after = licenseAfterPurchase({
      current: license({ status: "SUSPENDED", expiresAt: "2026-01-01" }),
      plan: "BRONZE",
      months: 1,
      planDeviceLimit: 20,
      today: TODAY,
    });
    expect(after.status).toBe("ACTIVE");
    expect(after.expiresAt).toBe("2026-10-17");
  });
});
