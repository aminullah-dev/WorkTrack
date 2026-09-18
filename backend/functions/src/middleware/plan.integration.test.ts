import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { db, tenant } from "../lib/firestore";
import { ApiError } from "../lib/errors";
import { clearPlanCache, enforcePlanState, requireFeature } from "./plan";
import { assertEmployeeHeadroom, setLicense } from "../services/license";
import { updateSettings } from "../services/settings";

/**
 * What the plans actually withhold.
 *
 * Two properties matter more than the gating itself. A company the vendor has
 * not metered must be untouched — that is every tenant that predates the plans.
 * And a company whose term has ended must still be able to READ everything it
 * recorded: the data is theirs whatever they owe, and a customer locked out of
 * their own attendance history is a customer who never pays the invoice.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
/** Yesterday in Kabul is what the guard compares against; keep dates far apart. */
const LONG_AGO = "2020-01-01";
let cid = "";
let seq = 0;

function call(
  middleware: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  method = "GET",
): Promise<ApiError | null> {
  const req = {
    method,
    auth: { uid: "emp_1", companyId: cid, employeeId: "emp_1", roles: ["COMPANY_ADMIN"], branchIds: [] },
    header: () => undefined,
  } as unknown as Request;

  return new Promise((resolve) => {
    middleware(req, {} as Response, (err?: unknown) => resolve((err as ApiError) ?? null));
  });
}

async function license(over: Record<string, unknown> = {}): Promise<void> {
  await setLicense(cid, {
    plan: "BRONZE",
    deviceLimit: 20,
    status: "ACTIVE",
    expiresAt: null,
    enforceDevices: false,
    enforcePlan: true,
    ...over,
  } as Parameters<typeof setLicense>[1]);
  clearPlanCache(cid);
}

async function addEmployees(count: number): Promise<void> {
  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    batch.set(tenant(cid, "employees").doc(`emp_${seq}_${i}`), {
      employeeCode: `E-${i}`,
      status: "ACTIVE",
    });
  }
  await batch.commit();
}

describe.skipIf(!EMULATOR)("plan enforcement", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `plan_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({
      name: "Metered Co",
      status: "ACTIVE",
      settings: { profile: { timezone: "Asia/Kabul", currency: "AFN" } },
    });
    clearPlanCache();
  });

  describe("a capability the plan does not include", () => {
    it("is refused", async () => {
      await license();
      const err = await call(requireFeature("payroll"));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe("FEATURE_NOT_IN_PLAN");
    });

    it("is allowed on a plan that includes it", async () => {
      await license({ plan: "SILVER", deviceLimit: 75 });
      expect(await call(requireFeature("payroll"))).toBeNull();
    });

    it("is allowed when the vendor granted it on top of the plan", async () => {
      // The one customer who needs a single capability is a licence change,
      // never a new tier and never a separate build.
      await license({ extraFeatures: ["payroll"] });
      expect(await call(requireFeature("payroll"))).toBeNull();
    });

    it("is allowed for a company that is not metered at all", async () => {
      await license({ enforcePlan: false });
      expect(await call(requireFeature("payroll"))).toBeNull();
    });
  });

  describe("a term that has ended", () => {
    it("still lets the company read everything it recorded", async () => {
      await license({ expiresAt: LONG_AGO });
      expect(await call(enforcePlanState, "GET")).toBeNull();
    });

    it("refuses new records", async () => {
      await license({ expiresAt: LONG_AGO });
      const err = await call(enforcePlanState, "POST");
      expect(err?.status).toBe(403);
      expect(err?.code).toBe("PLAN_EXPIRED");
    });

    it("keeps working inside the grace window", async () => {
      // Yesterday: expired, but a payment three days late is a customer paying.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      await license({ expiresAt: yesterday });
      expect(await call(enforcePlanState, "POST")).toBeNull();
    });

    it("does not stop a company the vendor has not metered", async () => {
      await license({ expiresAt: LONG_AGO, enforcePlan: false });
      expect(await call(enforcePlanState, "POST")).toBeNull();
    });

    it("refuses new records once the vendor suspends the licence", async () => {
      await license({ status: "SUSPENDED" });
      const err = await call(enforcePlanState, "POST");
      expect(err?.code).toBe("PLAN_EXPIRED");
    });
  });

  describe("a setting the plan does not cover", () => {
    it("refuses to turn face recognition on", async () => {
      // Refused at the switch rather than at the camera: a company that turned
      // it on and then found check-ins failing would call that a bug.
      await license();
      await expect(
        updateSettings(cid, { features: { faceRecognition: true } }, "emp_1", ["COMPANY_ADMIN"]),
      ).rejects.toMatchObject({ status: 403, code: "FEATURE_NOT_IN_PLAN" });
    });

    it("allows it on a plan that includes it", async () => {
      await license({ plan: "GOLD", deviceLimit: 500 });
      const next = await updateSettings(
        cid,
        { features: { faceRecognition: true } },
        "emp_1",
        ["COMPANY_ADMIN"],
      );
      expect(next.features.faceRecognition).toBe(true);
    });

    it("leaves other settings alone", async () => {
      await license();
      const next = await updateSettings(cid, { features: { leave: false } }, "emp_1", [
        "COMPANY_ADMIN",
      ]);
      expect(next.features.leave).toBe(false);
    });
  });

  describe("the headcount the plan covers", () => {
    it("refuses one more employee when the plan is full", async () => {
      await license({ employeeLimit: 2 });
      await addEmployees(2);
      await expect(assertEmployeeHeadroom(cid)).rejects.toMatchObject({
        status: 403,
        code: "PLAN_LIMIT_REACHED",
      });
    });

    it("allows the next one while there is room", async () => {
      await license({ employeeLimit: 3 });
      await addEmployees(2);
      await expect(assertEmployeeHeadroom(cid)).resolves.toBeUndefined();
    });

    it("counts only the people still on the books", async () => {
      await license({ employeeLimit: 2 });
      await addEmployees(2);
      await tenant(cid, "employees").doc(`emp_${seq}_0`).set({ status: "EXITED" }, { merge: true });
      await expect(assertEmployeeHeadroom(cid)).resolves.toBeUndefined();
    });

    it("ignores the cap for a company that is not metered", async () => {
      await license({ employeeLimit: 1, enforcePlan: false });
      await addEmployees(5);
      await expect(assertEmployeeHeadroom(cid)).resolves.toBeUndefined();
    });
  });
});
