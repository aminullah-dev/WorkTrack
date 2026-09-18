import { describe, it, expect, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { db, tenant } from "../lib/firestore";
import { ApiError } from "../lib/errors";
import { clearDeviceGuardCache, enforceDeviceLicense } from "./deviceGuard";
import { setLicense } from "../services/license";

/**
 * Turning enforcement on must limit a company to the seats it bought — and must
 * not lock out the phones that are already in employees' hands.
 *
 * The app in the field sends its device id on every request but has no way to
 * enrol it, so a guard that demanded a pre-existing registration would 403 every
 * employee of every paying company the moment the vendor issued a licence. These
 * pin the difference between "unenrolled" (enrol it) and "over the limit"
 * (refuse it), which is the only refusal the vendor actually sells.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let seq = 0;

/** Minimal Express doubles: the guard only reads req.auth and two headers. */
function call(
  roles: string[],
  headers: Record<string, string> = {},
  employeeId = "emp_1",
): Promise<ApiError | null> {
  const req = {
    auth: { uid: employeeId, companyId: cid, employeeId, roles, branchIds: [] },
    header: (name: string) => headers[name],
  } as unknown as Request;

  return new Promise((resolve) => {
    enforceDeviceLicense(req, {} as Response, (err?: unknown) =>
      resolve((err as ApiError) ?? null),
    );
  });
}

async function license(over: Record<string, unknown> = {}): Promise<void> {
  await setLicense(cid, {
    plan: "STANDARD",
    deviceLimit: 2,
    status: "ACTIVE",
    expiresAt: null,
    enforceDevices: true,
    ...over,
  } as Parameters<typeof setLicense>[1]);
}

async function seats(): Promise<string[]> {
  const snap = await tenant(cid, "devices").get();
  return snap.docs.filter((d) => d.data().status !== "REVOKED").map((d) => d.id);
}

describe.skipIf(!EMULATOR)("device licence enforcement", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `guard_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "Guarded Co" });
    // The guard caches per company and per device for a minute; without this a
    // later case inherits the previous one's answer.
    clearDeviceGuardCache();
  });

  it("lets a manager through — a browser is not a licensed device", async () => {
    await license({ deviceLimit: 1 });
    await tenant(cid, "devices").doc("taken").set({ status: "ACTIVE", type: "MOBILE" });

    expect(await call(["COMPANY_ADMIN"])).toBeNull();
    expect(await call(["HR_ADMIN"])).toBeNull();
  });

  it("lets everyone through while the licence does not enforce", async () => {
    await license({ enforceDevices: false, deviceLimit: 1 });

    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-unknown" })).toBeNull();
    expect(await seats()).toEqual([]); // nothing enrolled either
  });

  it("enrols a phone it has never seen rather than refusing it", async () => {
    // This is the case that would have bricked every fielded phone: the app
    // sends an id, nothing ever registered it.
    await license({ deviceLimit: 5 });

    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-fielded-phone" })).toBeNull();
    expect(await seats()).toEqual(["and-fielded-phone"]);
  });

  it("records what the phone told us about itself", async () => {
    await license();
    await call(["EMPLOYEE"], {
      "X-Device-Id": "and-pixel",
      "X-Device-Model": "Pixel 10",
      "X-App-Version": "1.0.0",
    });

    const doc = (await tenant(cid, "devices").doc("and-pixel").get()).data()!;
    expect(doc.model).toBe("Pixel 10");
    expect(doc.appVersion).toBe("1.0.0");
    expect(doc.employeeId).toBe("emp_1");
  });

  it("refuses the phone that exceeds the seats the company bought", async () => {
    await license({ deviceLimit: 2 });

    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-1" }, "e1")).toBeNull();
    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-2" }, "e2")).toBeNull();

    const third = await call(["EMPLOYEE"], { "X-Device-Id": "and-3" }, "e3");
    expect(third?.code).toBe("LICENSE_LIMIT_REACHED");
    expect(third?.status).toBe(403);
    expect((await seats()).length).toBe(2);
  });

  it("keeps letting the phones that hold seats through once the licence is full", async () => {
    // The company is at its limit; the people who already have the app must not
    // start failing because a colleague was refused.
    await license({ deviceLimit: 1 });
    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-1" }, "e1")).toBeNull();
    expect((await call(["EMPLOYEE"], { "X-Device-Id": "and-2" }, "e2"))?.code).toBe(
      "LICENSE_LIMIT_REACHED",
    );

    clearDeviceGuardCache();
    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-1" }, "e1")).toBeNull();
  });

  it("still refuses a phone an administrator revoked", async () => {
    await license();
    await tenant(cid, "devices").doc("and-lost").set({ status: "REVOKED", type: "MOBILE" });

    expect((await call(["EMPLOYEE"], { "X-Device-Id": "and-lost" }))?.code).toBe(
      "DEVICE_REVOKED",
    );
  });

  it("finds a kiosk's seat from its login, since it sends no device header", async () => {
    // createKioskAccount mints uid === kioskId === the device document id. The
    // kiosk runs in a browser, so keying off X-Device-Id would refuse them all.
    await license();
    await tenant(cid, "devices").doc("kiosk-abc").set({ status: "ACTIVE", type: "KIOSK" });

    expect(await call(["KIOSK"], {}, "kiosk-abc")).toBeNull();
  });

  it("refuses a kiosk that was revoked, and does not re-enrol it", async () => {
    // Unlike a phone, an unknown kiosk is not "never enrolled" — the account and
    // the device document are created together, so its absence is deliberate.
    await license();
    await tenant(cid, "devices").doc("kiosk-old").set({ status: "REVOKED", type: "KIOSK" });

    expect((await call(["KIOSK"], {}, "kiosk-old"))?.code).toBe("DEVICE_REVOKED");

    clearDeviceGuardCache();
    expect((await call(["KIOSK"], {}, "kiosk-never"))?.code).toBe("DEVICE_REVOKED");
    expect(await seats()).toEqual([]);
  });

  it("refuses everything on an expired licence", async () => {
    await license({ expiresAt: "2020-01-01" });

    expect((await call(["EMPLOYEE"], { "X-Device-Id": "and-1" }))?.code).toBe(
      "LICENSE_INACTIVE",
    );
    // …and does not quietly hand out a seat on the way to refusing.
    expect(await seats()).toEqual([]);
  });

  it("refuses everything on a suspended licence", async () => {
    await license({ status: "SUSPENDED" });

    expect((await call(["EMPLOYEE"], { "X-Device-Id": "and-1" }))?.code).toBe(
      "LICENSE_INACTIVE",
    );
  });

  it("lets an employee into the portal without taking a seat", async () => {
    // A browser has no device id and no way to get one. This used to 403 with
    // "sign in again to activate this device" — advice a browser can never act
    // on, and shown only at the companies that pay for enforcement. The licence
    // counts devices running the app, and a browser is not one.
    await license({ deviceLimit: 1 });

    expect(await call(["EMPLOYEE"], {})).toBeNull();
    expect(await seats()).toEqual([]); // and it consumed nothing
  });

  it("still refuses a kiosk that is not a known device", async () => {
    // The boundary that must not move with the line above: a kiosk also sends
    // no header, but its login IS its device record, so an unknown one was
    // revoked on purpose.
    await license();

    expect((await call(["KIOSK"], {}, "kiosk_gone"))?.code).toBe("DEVICE_REVOKED");
  });

  it("still counts a phone that does send its device id", async () => {
    // The exemption is for the absent header, not a weakening of the limit.
    await license({ deviceLimit: 1 });

    expect(await call(["EMPLOYEE"], { "X-Device-Id": "and-1" })).toBeNull();
    expect(await seats()).toEqual(["and-1"]);

    clearDeviceGuardCache();
    expect((await call(["EMPLOYEE"], { "X-Device-Id": "and-2" }, "emp_2"))?.code).toBe(
      "LICENSE_LIMIT_REACHED",
    );
  });

  it("still refuses a browser session on a suspended licence", async () => {
    // Exempt from the SEAT count, not from whether the licence is usable at all.
    await license({ status: "SUSPENDED" });

    expect((await call(["EMPLOYEE"], {}))?.code).toBe("LICENSE_INACTIVE");
  });
});
