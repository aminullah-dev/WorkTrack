import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { db, nowTimestamp, tenant } from "../lib/firestore";
import { runDocumentWatch } from "./documentWatch";
import { listNotifications } from "./notifications";

/**
 * The nightly sweep of the document register.
 *
 * A register nobody opens is not a control. What matters here is who gets told
 * and how often — a warning that arrives every night until somebody acts is a
 * warning people learn to ignore, and a warning sent to the employee instead
 * of to the person who can renew the paper is no warning at all.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TODAY = "2026-09-09";

let cid = "";
let seq = 0;

async function company(): Promise<void> {
  await db.collection("companies").doc(cid).set({
    name: "Docs",
    settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
  });
}

async function person(id: string, role: string | null): Promise<void> {
  await tenant(cid, "employees").doc(id).set({
    firstName: id,
    lastName: "T",
    status: "ACTIVE",
    ...(role ? { role } : {}),
  });
}

async function paper(employeeId: string, expiresOn: string | null): Promise<void> {
  await tenant(cid, "documents").doc(`${employeeId}_${expiresOn ?? "none"}`).set({
    employeeId,
    employeeName: employeeId,
    type: "CONTRACT",
    number: null,
    issuedOn: null,
    expiresOn,
    note: null,
    createdBy: "admin",
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
  });
}

beforeEach(async () => {
  seq += 1;
  cid = `dw_${Date.now()}_${seq}`;
  await company();
});

afterEach(async () => {
  await db.recursiveDelete(db.collection("companies").doc(cid));
});

describe.skipIf(!EMULATOR)("document expiry watch", () => {
  it("tells the people who can actually renew it", async () => {
    await person("e_admin", "HR_ADMIN");
    await person("e_worker", "EMPLOYEE");
    await paper("e_worker", "2026-09-20");

    await runDocumentWatch(TODAY);

    expect(await listNotifications(cid, "e_admin")).toHaveLength(1);
    // Not the employee: they cannot renew the company's copy or file it, and a
    // notification they can do nothing about is noise.
    expect(await listNotifications(cid, "e_worker")).toHaveLength(0);
  });

  it("says nothing when nothing is due", async () => {
    await person("e_admin", "HR_ADMIN");
    await paper("e_worker", "2028-01-01");

    const result = await runDocumentWatch(TODAY);

    expect(result.companiesWarned).toBe(0);
    expect(await listNotifications(cid, "e_admin")).toHaveLength(0);
  });

  it("ignores documents that never expire", async () => {
    await person("e_admin", "HR_ADMIN");
    await paper("e_worker", null); // a tazkira

    await runDocumentWatch(TODAY);

    expect(await listNotifications(cid, "e_admin")).toHaveLength(0);
  });

  it("counts what expired separately from what is about to", async () => {
    // "2 expired" and "2 expiring soon" call for different actions, and a
    // single number hides the one that is already a problem.
    await person("e_admin", "HR_ADMIN");
    await paper("a", "2026-05-01");
    await paper("b", "2026-06-01");
    await paper("c", "2026-09-20");

    await runDocumentWatch(TODAY);

    const [note] = await listNotifications(cid, "e_admin");
    expect(String(note.body)).toContain("۲"); // two expired
    expect(String(note.body)).toContain("۱"); // one expiring
  });

  // A longer budget on purpose: this runs the whole sweep three times, and the
  // sweep walks every company in the project. That is fine nightly and slow in
  // a shared emulator that other suites have filled with tenants.
  it("does not send the same warning again the same day", { timeout: 30_000 }, async () => {
    // Run twice — a retry, a redeploy — and the admin should still have one.
    await person("e_admin", "HR_ADMIN");
    await paper("e_worker", "2026-09-20");

    await runDocumentWatch(TODAY);
    await runDocumentWatch(TODAY);
    await runDocumentWatch(TODAY);

    expect(await listNotifications(cid, "e_admin")).toHaveLength(1);
  });

  it("warns again on a new day, because it is still not fixed", { timeout: 30_000 }, async () => {
    await person("e_admin", "HR_ADMIN");
    await paper("e_worker", "2026-09-20");

    await runDocumentWatch(TODAY);
    await runDocumentWatch("2026-09-10");

    expect(await listNotifications(cid, "e_admin")).toHaveLength(2);
  });

  it("stays quiet when there is nobody who could act", async () => {
    await person("e_worker", "EMPLOYEE");
    await paper("e_worker", "2026-09-20");

    const result = await runDocumentWatch(TODAY);

    expect(result.companiesWarned).toBe(0);
  });
});
