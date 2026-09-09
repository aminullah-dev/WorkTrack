import { describe, it, expect } from "vitest";
import { getAuth } from "firebase-admin/auth";
import { db, tenant } from "../lib/firestore";
import { companySignupSchema, provisionCompany } from "./signup";

/**
 * Provisioning wrote the company, branch, shift, employee and leave data one
 * document at a time and created the Firebase Auth login LAST. A duplicate
 * email — or a password Firebase rejected — therefore left a fully-formed
 * company that nobody could ever sign in to, and nothing cleaned it up.
 *
 * Skipped unless the Firestore and Auth emulators are running.
 */

const EMULATOR =
  Boolean(process.env.FIRESTORE_EMULATOR_HOST) &&
  Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

let seq = 0;

function signup(over: Record<string, unknown> = {}) {
  seq += 1;
  return companySignupSchema.parse({
    companyName: "Kabul Traders",
    adminFirstName: "Ahmad",
    adminLastName: "Karimi",
    email: `admin_${Date.now()}_${seq}@example.com`,
    password: "Passw0rd!",
    ...over,
  });
}

/** Companies are top-level, so an orphan is found by scanning for the name. */
async function companiesNamed(name: string): Promise<string[]> {
  const snap = await db.collection("companies").where("name", "==", name).get();
  return snap.docs.map((d) => d.id);
}

describe.skipIf(!EMULATOR)("company signup", () => {
  it("provisions a workspace the founding admin can sign in to", async () => {
    const input = signup();

    const { companyId, employeeId } = await provisionCompany(input);

    const company = await db.collection("companies").doc(companyId).get();
    expect(company.exists).toBe(true);

    const employee = await tenant(companyId, "employees").doc(employeeId).get();
    expect(employee.data()?.email).toBe(input.email);

    // The workspace is usable out of the box.
    const [branches, shifts, leaveTypes] = await Promise.all([
      tenant(companyId, "branches").get(),
      tenant(companyId, "shifts").get(),
      tenant(companyId, "leaveTypes").get(),
    ]);
    expect(branches.size).toBe(1);
    expect(shifts.size).toBe(1);
    expect(leaveTypes.size).toBe(2);
  });

  it("sets a construction company up for construction", async () => {
    // The whole point of asking: a firm with several sites gets fences on,
    // and a grace wide enough that arriving at a site is not arriving late.
    const { companyId } = await provisionCompany(signup({ businessType: "CONSTRUCTION" }));

    const settings = (await db.collection("companies").doc(companyId).get()).data()!.settings;
    expect(settings.features.geofencing).toBe(true);
    expect(settings.policies.lateGraceMinutes).toBe(20);
    expect(settings.profile.businessType).toBe("CONSTRUCTION");
  });

  it("does not fence a tailoring workshop, or point a camera at it", async () => {
    const { companyId } = await provisionCompany(signup({ businessType: "TAILORING" }));

    const settings = (await db.collection("companies").doc(companyId).get()).data()!.settings;
    expect(settings.features.geofencing).toBe(false);
    expect(settings.features.faceRecognition).toBe(false);
    // Everything the preset was silent about is untouched.
    expect(settings.features.payroll).toBe(true);
    expect(settings.policies.weekendDays).toEqual([5]);
  });

  it("still provisions a workspace when the type is unknown or absent", async () => {
    // Nobody fails to sign up because of a dropdown.
    const plain = await provisionCompany(signup());
    const odd = await provisionCompany(signup({ businessType: "A_TYPE_WE_RETIRED" }));

    for (const { companyId } of [plain, odd]) {
      const settings = (await db.collection("companies").doc(companyId).get()).data()!.settings;
      expect(settings.features.geofencing).toBe(true);
      expect(settings.policies.standardDailyMinutes).toBe(480);
      expect(settings.profile.businessType).toBeNull();
    }
  });

  it("creates the login unverified and gated", async () => {
    const input = signup();

    const { companyId, employeeId } = await provisionCompany(input);

    const user = await getAuth().getUser(employeeId);
    // Whoever filled in the form asserted this address; only the link Firebase
    // mails to it proves they own it.
    expect(user.emailVerified).toBe(false);
    expect(user.customClaims).toMatchObject({
      cid: companyId,
      eid: employeeId,
      r: ["COMPANY_ADMIN"],
      sv: true,
    });
  });

  it("normalises the email so the same address cannot be taken twice", async () => {
    // Unique per run, like every other address in this file: a fixed one is
    // still registered on the next run against the same emulator, so the first
    // provisionCompany below fails and the test only ever passes once.
    const local = `Mixed.Case_${Date.now()}_${seq++}`;
    const input = signup({ email: `${local}@Example.COM` });
    expect(input.email).toBe(`${local.toLowerCase()}@example.com`);

    await provisionCompany(input);

    await expect(
      provisionCompany(signup({ email: `${local.toUpperCase()}@example.com` })),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("leaves no orphaned company when the email is already registered", async () => {
    const first = signup({ companyName: "Orphan Test A" });
    await provisionCompany(first);

    await expect(
      provisionCompany(signup({ companyName: "Orphan Test B", email: first.email })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // The refused attempt must not have left a company behind.
    expect(await companiesNamed("Orphan Test B")).toHaveLength(0);
  });

  it("leaves no orphaned company when the password is rejected", async () => {
    // Firebase requires at least six characters; the schema allows eight, so a
    // short-but-schema-valid password is not reachable — use the API directly.
    await expect(
      provisionCompany({
        ...signup({ companyName: "Orphan Test C" }),
        password: "x",
      }),
    ).rejects.toThrow();

    expect(await companiesNamed("Orphan Test C")).toHaveLength(0);
  });

  it("creates only one company when the same email is submitted twice at once", async () => {
    // The name is unique per run for the same reason the addresses are: the
    // assertion counts companies by name, and a fixed one accumulates across
    // runs against a persistent emulator until the count is never 1 again.
    const name = `Race Test ${Date.now()}_${seq++}`;
    const input = signup({ companyName: name });

    const results = await Promise.allSettled([
      provisionCompany({ ...input }),
      provisionCompany({ ...input }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await companiesNamed(name)).toHaveLength(1);
  });
});
