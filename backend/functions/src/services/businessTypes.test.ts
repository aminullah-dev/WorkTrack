import { describe, it, expect } from "vitest";
import {
  BASE_FEATURES,
  BASE_POLICIES,
  BUSINESS_TYPES,
  BUSINESS_TYPE_IDS,
  settingsForBusinessType,
} from "./businessTypes";

describe("the catalogue itself", () => {
  it("offers a real choice rather than a token one", () => {
    expect(BUSINESS_TYPES.length).toBeGreaterThanOrEqual(15);
  });

  it("has no duplicate ids", () => {
    expect(new Set(BUSINESS_TYPE_IDS).size).toBe(BUSINESS_TYPE_IDS.length);
  });

  it("says why every type differs", () => {
    // A default nobody explained is a default nobody can safely change.
    for (const type of BUSINESS_TYPES) {
      expect(type.because.length, `${type.id} has no reason`).toBeGreaterThan(20);
    }
  });

  it("only ever states differences from the product defaults", () => {
    // A preset that repeats a default silently pins it: change the product
    // default later and fifteen types quietly keep the old one.
    for (const type of BUSINESS_TYPES) {
      for (const [key, value] of Object.entries(type.features)) {
        // ...unless the type declares it is pinning that value on purpose.
        if (type.pins?.includes(key as never)) continue;
        expect(
          value,
          `${type.id} restates the default for features.${key} without declaring it in pins`,
        ).not.toEqual(BASE_FEATURES[key as keyof typeof BASE_FEATURES]);
      }
      for (const [key, value] of Object.entries(type.policies)) {
        expect(
          JSON.stringify(value),
          `${type.id} restates the default for policies.${key}`,
        ).not.toEqual(JSON.stringify(BASE_POLICIES[key as keyof typeof BASE_POLICIES]));
      }
    }
  });

  it("pins the tailoring workshop's camera off, not merely defaults it", () => {
    // If somebody ever flips the product default to true, this workshop must
    // not quietly inherit it. Declaring the pin is what makes that a decision
    // rather than an accident of ordering.
    const tailoring = BUSINESS_TYPES.find((t) => t.id === "TAILORING")!;
    expect(tailoring.pins).toContain("faceRecognition");
    expect(tailoring.features.faceRecognition).toBe(false);
  });

  it("never turns face recognition on for anybody", () => {
    // Nobody gets biometrics switched on because of a dropdown. It is a
    // decision a company makes about its own staff, in its own settings.
    for (const type of BUSINESS_TYPES) {
      expect(type.features.faceRecognition ?? false, `${type.id} enables faces`).toBe(false);
    }
  });
});

describe("what a new company starts with", () => {
  it("gives the product defaults when no type is chosen", () => {
    // Signing up must never fail over a dropdown, and a company that predates
    // this is not misconfigured.
    expect(settingsForBusinessType(null).features).toEqual(BASE_FEATURES);
    expect(settingsForBusinessType(undefined).policies).toEqual(BASE_POLICIES);
    expect(settingsForBusinessType("SOMETHING_WE_REMOVED").features).toEqual(BASE_FEATURES);
  });

  it("keeps a construction company's fences, and widens its grace", () => {
    const s = settingsForBusinessType("CONSTRUCTION");
    expect(s.features.geofencing).toBe(true);
    expect(s.policies.lateGraceMinutes).toBe(20);
  });

  it("does not fence an office or a shop", () => {
    // Both work at one address they already control. A fence there is noise.
    expect(settingsForBusinessType("OFFICE").features.geofencing).toBe(false);
    expect(settingsForBusinessType("RETAIL").features.geofencing).toBe(false);
  });

  it("gives a security company a twelve-hour day", () => {
    expect(settingsForBusinessType("SECURITY").policies.standardDailyMinutes).toBe(720);
  });

  it("leaves a tailoring workshop no camera at the door", () => {
    // The deliberate one. A workshop staffed by women may find a camera a
    // reason not to buy the product at all.
    const s = settingsForBusinessType("TAILORING");
    expect(s.features.faceRecognition).toBe(false);
    expect(s.features.qrKiosk).toBe(false);
    expect(s.features.geofencing).toBe(false);
  });

  it("gives an NGO the Thursday-Friday weekend it actually keeps", () => {
    expect(settingsForBusinessType("NGO").policies.weekendDays).toEqual([4, 5]);
  });

  it("changes nothing it was not asked to change", () => {
    // The preset is a patch, not a replacement: everything the type is silent
    // about stays exactly as the product intended.
    const s = settingsForBusinessType("SECURITY");
    expect(s.features).toEqual(BASE_FEATURES);
    expect(s.policies.weekendDays).toEqual(BASE_POLICIES.weekendDays);
    expect(s.policies.lateGraceMinutes).toBe(BASE_POLICIES.lateGraceMinutes);
  });

  it("hands back a fresh object each time", () => {
    // Callers write into these before storing them; a shared object would let
    // one company's signup edit the next one's defaults.
    const a = settingsForBusinessType("OFFICE");
    a.features.payroll = false;
    expect(settingsForBusinessType("OFFICE").features.payroll).toBe(true);
    expect(BASE_FEATURES.payroll).toBe(true);
  });
});
