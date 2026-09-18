import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { recomputeAttendanceDay } from "./attendance";

/**
 * recomputeAttendanceDay against a real Firestore, because the bugs in it were
 * never in the arithmetic — they were in which punches the query returned.
 * attendance.test.ts pins the date helpers; only this can prove the projection
 * actually uses them.
 *
 * Skipped unless a Firestore emulator is running:
 *   firebase emulators:exec --only firestore --project demo-worktrack \
 *     "npx vitest run src/services/attendance.integration.test.ts"
 */

const KABUL = "Asia/Kabul";
const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let cid = "";
let seq = 0;

async function punch(
  employeeId: string,
  iso: string,
  type: "IN" | "OUT",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await tenant(cid, "punches")
    .doc(`p${String(seq++).padStart(4, "0")}`)
    .set({
      companyId: cid,
      employeeId,
      punchedAt: Timestamp.fromDate(new Date(iso)),
      type,
      method: "GPS",
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      geofenceId: null,
      insideFence: false,
      kioskId: null,
      note: null,
      serverValidated: true,
      invalidReason: null,
      updatedAt: Timestamp.now(),
      ...extra,
    });
}

async function dayOf(employeeId: string, date: string): Promise<Record<string, unknown>> {
  const snap = await tenant(cid, "attendanceDays").doc(`${employeeId}_${date}`).get();
  expect(snap.exists, `attendanceDays/${employeeId}_${date} was not written`).toBe(true);
  return snap.data() as Record<string, unknown>;
}

describe.skipIf(!EMULATOR)("recomputeAttendanceDay", () => {
  beforeEach(async () => {
    // A fresh tenant per test: no cross-test bleed, no cleanup to forget.
    cid = `it_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "IT", timezone: KABUL });
  });

  it("counts a night shift on the day it was worked", async () => {
    // 01:00 and 03:00 on the 27th in Kabul — which is the evening of the 26th
    // in UTC. A UTC-midnight window starts at 04:30 Kabul and misses both,
    // writing an empty day for a shift that was actually worked.
    await punch("e1", "2026-07-26T20:30:00Z", "IN");
    await punch("e1", "2026-07-26T22:30:00Z", "OUT");

    await recomputeAttendanceDay(cid, "e1", "2026-07-27", KABUL);

    const day = await dayOf("e1", "2026-07-27");
    expect(day.workedMinutes).toBe(120);
    expect(day.status).toBe("HALF_DAY");
  });

  it("counts an ordinary daytime shift", async () => {
    // 08:30 → 16:30 Kabul.
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);

    const day = await dayOf("e1", "2026-07-26");
    expect(day.workedMinutes).toBe(480);
    expect(day.status).toBe("PRESENT");
  });

  it("treats an open session as present rather than absent", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);

    const day = await dayOf("e1", "2026-07-26");
    expect(day.status).toBe("PRESENT");
    expect(day.workedMinutes).toBe(0);
  });

  it("leaves a punch from the next local day out of this one", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");
    // 00:30 on the 27th in Kabul — belongs to the 27th, not the 26th.
    await punch("e1", "2026-07-26T20:00:00Z", "IN");

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);

    const day = await dayOf("e1", "2026-07-26");
    expect(day.workedMinutes).toBe(480);
    // The late punch must not reopen the day as still-clocked-in.
    expect(day.lastOutAt).not.toBeNull();
  });

  it("excludes a refused punch from worked time but reports why", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");
    await punch("e1", "2026-07-26T13:00:00Z", "IN", {
      serverValidated: false,
      invalidReason: "GEOFENCE_VIOLATION",
    });

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);

    const day = await dayOf("e1", "2026-07-26");
    expect(day.workedMinutes).toBe(480);
    expect(day.rejectedCount).toBe(1);
    expect(day.rejectedReason).toBe("GEOFENCE_VIOLATION");
  });

  it("keeps one employee's punches out of another's day", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");
    await punch("e2", "2026-07-26T05:00:00Z", "IN");

    await recomputeAttendanceDay(cid, "e2", "2026-07-26", KABUL);

    const day = await dayOf("e2", "2026-07-26");
    expect(day.workedMinutes).toBe(0);
    expect(day.status).toBe("PRESENT");
  });
});

describe.skipIf(!EMULATOR)("night shifts", () => {
  beforeEach(async () => {
    cid = `ns_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "Night", timezone: KABUL });
  });

  it("keeps a session with the day it started, not the day it ended", async () => {
    // 22:00 on the 26th to 02:00 on the 27th, Kabul. The clock-out lands in the
    // next day's window; the four hours belong to the 26th all the same.
    await punch("e1", "2026-07-26T17:30:00Z", "IN");
    await punch("e1", "2026-07-26T21:30:00Z", "OUT");

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);
    const day = await dayOf("e1", "2026-07-26");

    expect(day.workedMinutes).toBe(240);
    expect(day.lastOutAt).not.toBeNull();
  });

  it("does not also count that session on the day it ended", async () => {
    await punch("e1", "2026-07-26T17:30:00Z", "IN");
    await punch("e1", "2026-07-26T21:30:00Z", "OUT");

    await recomputeAttendanceDay(cid, "e1", "2026-07-27", KABUL);
    const day = await dayOf("e1", "2026-07-27");

    // The stray clock-out must not open or close anything here.
    expect(day.workedMinutes).toBe(0);
    expect(day.status).toBe("PENDING");
  });

  it("does not treat an overnight shift as a full day of overtime", async () => {
    await tenant(cid, "shifts").doc("night").set({
      startTime: "22:00",
      endTime: "06:00",
      graceInMinutes: 10,
      graceOutMinutes: 10,
      breakMinutes: 0,
    });
    await tenant(cid, "shiftAssignments").doc("a1").set({
      employeeId: "e1",
      date: "2026-07-26",
      shiftId: "night",
    });
    await punch("e1", "2026-07-26T17:30:00Z", "IN"); // 22:00 Kabul
    await punch("e1", "2026-07-26T21:30:00Z", "OUT"); // 02:00 Kabul

    await recomputeAttendanceDay(cid, "e1", "2026-07-26", KABUL);
    const day = await dayOf("e1", "2026-07-26");

    // Scheduled is 8h; four hours worked is under it, so no overtime at all.
    // The pre-fix arithmetic made scheduled negative and called all 240 overtime.
    expect(day.overtimeMinutes).toBe(0);
  });
});
