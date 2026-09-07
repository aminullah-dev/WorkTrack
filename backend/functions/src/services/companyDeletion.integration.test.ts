import { describe, it, expect, beforeEach } from "vitest";
import { db, tenant } from "../lib/firestore";
import {
  allDocIds,
  cancelDeletion,
  companiesDueForPurge,
  getDeletion,
  purgeCompany,
  requestDeletion,
} from "./companyDeletion";

/**
 * Closing an account destroys a tenant's payroll history. These check that it
 * takes a deliberate, matured request to get there — and that nothing short of
 * that deletes anything.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const NAME = "شرکت ساختمانی کابل";
let cid = "";
let seq = 0;

async function company(): Promise<void> {
  await db.collection("companies").doc(cid).set({ name: NAME, status: "ACTIVE" });
  await tenant(cid, "employees").doc("emp_1").set({ firstName: "A", lastName: "B", status: "ACTIVE" });
  await tenant(cid, "payslips").doc("p1").set({ net: 30000 });
}

describe.skipIf(!EMULATOR)("closing a company account", () => {
  beforeEach(async () => {
    cid = `del_${Date.now()}_${seq++}`;
    await company();
  });

  it("reports nothing scheduled to begin with", async () => {
    expect((await getDeletion(cid)).status).toBe("NONE");
  });

  it("refuses a request that does not type the company name", async () => {
    await expect(
      requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: "Some Other Co" }, "2026-08-01"),
    ).rejects.toMatchObject({ status: 400 });
    expect((await getDeletion(cid)).status).toBe("NONE");
  });

  it("accepts the name with stray whitespace around it", async () => {
    const d = await requestDeletion(
      cid, "admin", "COMPANY_ADMIN", { confirmName: `  ${NAME}  ` }, "2026-08-01",
    );
    expect(d.status).toBe("SCHEDULED");
  });

  it("schedules the purge thirty days out and suspends the account now", async () => {
    const d = await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");
    expect(d.purgeAfter).toBe("2026-08-31");

    const snap = await db.collection("companies").doc(cid).get();
    // Suspended immediately, so nobody keeps filing into a tenant on its way out.
    expect(snap.data()?.status).toBe("SUSPENDED");
  });

  it("destroys nothing while the grace period runs", async () => {
    await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");
    await expect(purgeCompany(cid, "2026-08-30")).rejects.toMatchObject({ status: 422 });

    expect((await tenant(cid, "payslips").get()).size).toBe(1);
    expect((await db.collection("companies").doc(cid).get()).exists).toBe(true);
  });

  it("gives everything back on cancel", async () => {
    await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");
    await cancelDeletion(cid, "admin", "COMPANY_ADMIN");

    expect((await getDeletion(cid)).status).toBe("NONE");
    const snap = await db.collection("companies").doc(cid).get();
    expect(snap.data()?.status).toBe("ACTIVE");
    expect((await tenant(cid, "payslips").get()).size).toBe(1);
  });

  it("refuses to cancel something nobody scheduled", async () => {
    await expect(cancelDeletion(cid, "admin", "COMPANY_ADMIN")).rejects.toMatchObject({ status: 422 });
  });

  it("refuses to purge a company nobody asked to close", async () => {
    await expect(purgeCompany(cid, "2030-01-01")).rejects.toMatchObject({ status: 422 });
    expect((await db.collection("companies").doc(cid).get()).exists).toBe(true);
  });

  it("purges the whole tree once the grace period has elapsed", async () => {
    await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");
    const result = await purgeCompany(cid, "2026-08-31");

    expect(result.purged).toBe(true);
    expect((await db.collection("companies").doc(cid).get()).exists).toBe(false);
    // recursiveDelete has to take the subcollections too, or they are orphaned
    // and keep a deleted company's payroll readable forever.
    expect((await tenant(cid, "payslips").get()).size).toBe(0);
    expect((await tenant(cid, "employees").get()).size).toBe(0);
  });

  it("collects every login, not just the first page", async () => {
    // The purge deletes the tree straight after collecting the ids, so anything
    // a single capped read left behind would be an orphaned Firebase Auth
    // account — still carrying valid cid/eid claims — with no record left of
    // which accounts to clean up. 1,050 crosses the 1,000-document page.
    const writer = db.bulkWriter();
    for (let i = 0; i < 1050; i++) {
      void writer.set(tenant(cid, "employees").doc(`emp_${String(i).padStart(5, "0")}`), {
        firstName: "A",
        lastName: String(i),
        status: "ACTIVE",
      });
    }
    await writer.close();

    const ids = await allDocIds(cid, "employees");
    // 1,050 seeded here plus the emp_1 the fixture creates.
    expect(ids.length).toBe(1051);
    expect(new Set(ids).size).toBe(1051); // no page overlap
  }, 60_000);

  it("lists only the companies that are actually due", async () => {
    await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");

    expect(await companiesDueForPurge("2026-08-30")).not.toContain(cid);
    expect(await companiesDueForPurge("2026-08-31")).toContain(cid);
  });

  it("drops a cancelled company off the due list", async () => {
    await requestDeletion(cid, "admin", "COMPANY_ADMIN", { confirmName: NAME }, "2026-08-01");
    await cancelDeletion(cid, "admin", "COMPANY_ADMIN");
    expect(await companiesDueForPurge("2030-01-01")).not.toContain(cid);
  });
});
