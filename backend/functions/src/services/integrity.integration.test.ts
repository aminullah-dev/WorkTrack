import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { recomputeAttendanceDay } from "./attendance";
import { auditAttendanceDays, auditWindow } from "./integrity";

/**
 * The audit exists because a projection failure was invisible for weeks, so
 * the test that matters is: does it actually notice? Each case reproduces the
 * production state and asserts the audit reports it.
 *
 * Skipped unless a Firestore emulator is running (see attendance.integration).
 */

const KABUL = "Asia/Kabul";
const DATE = "2026-07-26";
const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let cid = "";
let seq = 0;

async function punch(employeeId: string, iso: string, type: "IN" | "OUT"): Promise<void> {
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
    });
}

describe.skipIf(!EMULATOR)("attendance integrity audit", () => {
  beforeEach(async () => {
    cid = `au_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "Audit", timezone: KABUL });
  });

  it("reports a day whose projection was never written", async () => {
    // Exactly the production state: punches stored, recompute never ran.
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");

    const findings = await auditAttendanceDays(cid, [DATE], KABUL);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      employeeId: "e1",
      date: DATE,
      problem: "MISSING_DAY",
      punchCount: 2,
    });
  });

  it("stays quiet once the day has been computed", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");
    await recomputeAttendanceDay(cid, "e1", DATE, KABUL);

    expect(await auditAttendanceDays(cid, [DATE], KABUL)).toEqual([]);
  });

  it("reports a day left behind by a later punch", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await recomputeAttendanceDay(cid, "e1", DATE, KABUL);
    // A punch arriving after the projection was written, whose own recompute
    // failed — the day is present but no longer reflects the punch stream.
    await new Promise((r) => setTimeout(r, 25));
    await punch("e1", "2026-07-26T12:00:00Z", "OUT");

    const findings = await auditAttendanceDays(cid, [DATE], KABUL);

    expect(findings).toHaveLength(1);
    expect(findings[0].problem).toBe("STALE_DAY");
  });

  it("reports each affected employee separately", async () => {
    await punch("e1", "2026-07-26T04:00:00Z", "IN");
    await punch("e2", "2026-07-26T05:00:00Z", "IN");
    await recomputeAttendanceDay(cid, "e1", DATE, KABUL); // only one repaired

    const findings = await auditAttendanceDays(cid, [DATE], KABUL);

    expect(findings.map((f) => f.employeeId)).toEqual(["e2"]);
  });

  it("says nothing about a day with no punches at all", async () => {
    expect(await auditAttendanceDays(cid, [DATE], KABUL)).toEqual([]);
  });
});

describe("audit window", () => {
  it("covers yesterday and today in the company's zone", () => {
    // 00:23 UTC is already the 27th in Kabul, so the window is the 26th–27th
    // even though UTC would still call it the 26th.
    expect(auditWindow(new Date("2026-07-27T00:23:00Z"), KABUL)).toEqual([
      "2026-07-26",
      "2026-07-27",
    ]);
  });

  it("includes yesterday so a day still being worked is not flagged", () => {
    const [yesterday, today] = auditWindow(new Date("2026-07-27T12:00:00Z"), KABUL);
    expect(yesterday).toBe("2026-07-26");
    expect(today).toBe("2026-07-27");
  });
});
