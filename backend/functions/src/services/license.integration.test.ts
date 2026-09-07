import { describe, it, expect, beforeEach } from "vitest";
import { db, tenant } from "../lib/firestore";
import {
  activateDevice,
  getLicense,
  listDevices,
  setDeviceStatus,
  setLicense,
  DEFAULT_LICENSE,
} from "./license";

/**
 * Per-device licensing. The seat count and the write that depends on it happen
 * in one transaction: counting first and writing after would let two tablets
 * set up side by side both read "one seat left" and both take it.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TODAY = "2026-08-24";
let cid = "";
let seq = 0;

function device(id: string) {
  return { deviceId: id, platform: "ANDROID" as const, model: "Pixel 10", appVersion: "1.0.0" };
}

async function license(over: Record<string, unknown> = {}) {
  await setLicense(cid, {
    plan: "STANDARD",
    deviceLimit: 2,
    status: "ACTIVE",
    expiresAt: null,
    enforceDevices: true,
    ...over,
  } as Parameters<typeof setLicense>[1]);
}

describe.skipIf(!EMULATOR)("device licensing", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `lic_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({
      name: "Licensed Co",
      settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
    });
  });

  it("falls back to a default licence when none is on file", async () => {
    expect(await getLicense(cid)).toEqual(DEFAULT_LICENSE);
  });

  it("does not enforce devices until a company opts in", async () => {
    // Shipping this must not lock out the app builds already in the field.
    expect(DEFAULT_LICENSE.enforceDevices).toBe(false);
  });

  it("takes a seat when a new device activates", async () => {
    await license();

    const result = await activateDevice(cid, "e1", device("device-aaa1"), TODAY);

    expect(result.seatTaken).toBe(true);
    expect(result.devicesInUse).toBe(1);
    expect(result.device.status).toBe("ACTIVE");
  });

  it("does not take a second seat when the same device comes back", async () => {
    await license();
    await activateDevice(cid, "e1", device("device-aaa1"), TODAY);

    const again = await activateDevice(cid, "e1", device("device-aaa1"), TODAY);

    expect(again.seatTaken).toBe(false);
    expect(again.devicesInUse).toBe(1);
  });

  it("refuses a device once every seat is taken", async () => {
    await license(); // two seats
    await activateDevice(cid, "e1", device("device-aaa1"), TODAY);
    await activateDevice(cid, "e2", device("device-bbb2"), TODAY);

    await expect(
      activateDevice(cid, "e3", device("device-ccc3"), TODAY),
    ).rejects.toMatchObject({ status: 403, code: "LICENSE_LIMIT_REACHED" });
  });

  it("never oversubscribes when devices activate simultaneously", async () => {
    await license({ deviceLimit: 3 });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        activateDevice(cid, `e${i}`, device(`device-race-${i}`), TODAY),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const active = (await listDevices(cid)).filter((d) => d.status === "ACTIVE");
    expect(active).toHaveLength(3);
  }, 30_000);

  it("frees the seat when a device is revoked", async () => {
    await license({ deviceLimit: 1 });
    await activateDevice(cid, "e1", device("device-aaa1"), TODAY);
    await expect(
      activateDevice(cid, "e2", device("device-bbb2"), TODAY),
    ).rejects.toMatchObject({ code: "LICENSE_LIMIT_REACHED" });

    await setDeviceStatus(cid, "device-aaa1", "REVOKED");

    const replacement = await activateDevice(cid, "e2", device("device-bbb2"), TODAY);
    expect(replacement.seatTaken).toBe(true);
  });

  it("refuses a revoked device rather than silently re-admitting it", async () => {
    await license();
    await activateDevice(cid, "e1", device("device-aaa1"), TODAY);
    await setDeviceStatus(cid, "device-aaa1", "REVOKED");

    await expect(
      activateDevice(cid, "e1", device("device-aaa1"), TODAY),
    ).rejects.toMatchObject({ status: 403, code: "DEVICE_REVOKED" });
  });

  it("counts a kiosk against the licence", async () => {
    await license({ deviceLimit: 1 });
    // Kiosk records predate this feature and carry `active`, not `status`.
    await tenant(cid, "devices").doc("kiosk-1").set({
      companyId: cid,
      type: "KIOSK",
      label: "Gate tablet",
      active: true,
    });

    await expect(
      activateDevice(cid, "e1", device("device-aaa1"), TODAY),
    ).rejects.toMatchObject({ code: "LICENSE_LIMIT_REACHED" });
  });

  it("does not let a deactivated kiosk keep holding a seat", async () => {
    await license({ deviceLimit: 1 });
    await tenant(cid, "devices").doc("kiosk-1").set({
      companyId: cid,
      type: "KIOSK",
      active: false,
    });

    const result = await activateDevice(cid, "e1", device("device-aaa1"), TODAY);
    expect(result.seatTaken).toBe(true);
  });

  it("refuses activation on a suspended licence", async () => {
    await license({ status: "SUSPENDED" });

    await expect(
      activateDevice(cid, "e1", device("device-aaa1"), TODAY),
    ).rejects.toMatchObject({ status: 403, code: "LICENSE_INACTIVE" });
  });

  it("refuses activation once the licence has expired", async () => {
    await license({ expiresAt: "2026-08-23" });

    await expect(
      activateDevice(cid, "e1", device("device-aaa1"), TODAY),
    ).rejects.toMatchObject({ code: "LICENSE_INACTIVE" });
  });

  it("still works on the last day of the licence", async () => {
    await license({ expiresAt: TODAY });

    const result = await activateDevice(cid, "e1", device("device-aaa1"), TODAY);
    expect(result.seatTaken).toBe(true);
  });
});
