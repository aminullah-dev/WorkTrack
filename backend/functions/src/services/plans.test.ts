import { describe, it, expect } from "vitest";
import { DEFAULT_PLANS, PLAN_IDS, TERMS, normalizePlan, priceOf } from "./plans";

describe("plan tiers", () => {
  it("maps the tier names licences were issued with before the plans were sold", () => {
    expect(normalizePlan("FREE")).toBe("BRONZE");
    expect(normalizePlan("STANDARD")).toBe("SILVER");
    expect(normalizePlan("ENTERPRISE")).toBe("GOLD");
  });

  it("keeps the current names, and falls back rather than throwing", () => {
    expect(normalizePlan("GOLD")).toBe("GOLD");
    expect(normalizePlan("gold")).toBe("GOLD");
    // A licence carrying something nobody recognises still has to be readable.
    expect(normalizePlan("PLATINUM")).toBe("BRONZE");
    expect(normalizePlan(undefined)).toBe("BRONZE");
  });

  it("grows: each tier includes everything the one below it does", () => {
    const bronze = DEFAULT_PLANS.BRONZE.features;
    const silver = DEFAULT_PLANS.SILVER.features;
    const gold = DEFAULT_PLANS.GOLD.features;
    expect(bronze.every((f) => silver.includes(f))).toBe(true);
    expect(silver.every((f) => gold.includes(f))).toBe(true);
    expect(DEFAULT_PLANS.SILVER.employeeLimit).toBeGreaterThan(DEFAULT_PLANS.BRONZE.employeeLimit);
    expect(DEFAULT_PLANS.GOLD.employeeLimit).toBeGreaterThan(DEFAULT_PLANS.SILVER.employeeLimit);
  });

  it("gives the trial everything the top tier has", () => {
    expect(DEFAULT_PLANS.TRIAL.features).toEqual(DEFAULT_PLANS.GOLD.features);
    // …and never sells it.
    expect(DEFAULT_PLANS.TRIAL.purchasable).toBe(false);
    expect(DEFAULT_PLANS.TRIAL.priceAfn).toBe(0);
  });

  it("prices a year at ten months", () => {
    expect(priceOf(DEFAULT_PLANS.SILVER, "MONTHLY")).toBe(DEFAULT_PLANS.SILVER.priceAfn);
    expect(priceOf(DEFAULT_PLANS.SILVER, "YEARLY")).toBe(DEFAULT_PLANS.SILVER.priceAfn * 10);
    expect(TERMS.YEARLY.months).toBe(12);
  });

  it("covers every tier in the catalogue", () => {
    for (const id of PLAN_IDS) expect(DEFAULT_PLANS[id].id).toBe(id);
  });
});
