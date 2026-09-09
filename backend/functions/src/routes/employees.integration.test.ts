import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { db } from "../lib/firestore";

/**
 * Employee codes, through the endpoint that actually assigns them.
 *
 * services/employees.test.ts pins the arithmetic. What it cannot see is
 * whether the route reads the right collection, whether one company's numbers
 * leak into another's, and whether an ordinary edit — which writes the whole
 * document with set() — quietly blanks the code of somebody who already has
 * one.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const token = vi.hoisted(() => ({ claims: {} as Record<string, unknown> }));
vi.mock("firebase-admin/auth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getAuth: () => ({
      verifyIdToken: async () => {
        if (!token.claims.uid) throw new Error("no token");
        return token.claims;
      },
    }),
  };
});

const { createApp } = await import("../app");
const app = createApp();

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  } finally {
    server.close();
  }
}

let cid = "";
let seq = 0;

/** No login is provisioned: this is about numbering, not about Firebase Auth. */
function newHire(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: "Ali",
    lastName: "Rahimi",
    email: `ali${seq}.${Math.random().toString(36).slice(2, 8)}@example.com`,
    employmentType: "FULL_TIME",
    joinDate: "2026-09-09",
    createLogin: false,
    ...over,
  };
}

async function seedCompany(codes: string[]): Promise<void> {
  await db.collection("companies").doc(cid).set({ name: "Kabul Construction" });
  await Promise.all(
    codes.map((employeeCode, i) =>
      db
        .collection("companies")
        .doc(cid)
        .collection("employees")
        .doc(`e_seed_${i}`)
        .set({ employeeCode, firstName: "Seed", lastName: `${i}`, status: "ACTIVE" }),
    ),
  );
}

describe.skipIf(!EMULATOR)("employee codes", () => {
  beforeEach(() => {
    seq += 1;
    cid = `c_emp_${seq}`;
    token.claims = { uid: "u_admin", cid, eid: "e_admin", r: ["HR_ADMIN"], email_verified: true };
  });

  // The emulator is shared with every other suite in the run, and the vendor
  // console asserts over EVERY company it can see — so a tenant left behind
  // here fails a test three files away, with a message that points nowhere
  // near the cause. Take out what this file put in.
  afterEach(async () => {
    await Promise.all(
      [cid, `${cid}_other`].map((id) =>
        db.recursiveDelete(db.collection("companies").doc(id)),
      ),
    );
  });

  it("continues from the code signup wrote for the founding admin", async () => {
    await seedCompany(["E-001"]);

    const res = await request("POST", "/v1/employees", newHire());

    expect(res.status).toBe(201);
    expect(res.body.data.employeeCode).toBe("E-002");
  });

  it("keeps numbering across several hires", async () => {
    await seedCompany(["E-001"]);

    const codes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await request("POST", "/v1/employees", newHire());
      expect(res.status).toBe(201);
      codes.push(res.body.data.employeeCode);
    }

    expect(codes).toEqual(["E-002", "E-003", "E-004"]);
  });

  it("counts from the highest code, not from how many people there are", async () => {
    // Somebody left and was removed. Numbering by headcount would hand out a
    // code another employee already holds.
    await seedCompany(["E-001", "E-004", "E-009"]);

    const res = await request("POST", "/v1/employees", newHire());

    expect(res.body.data.employeeCode).toBe("E-010");
  });

  it("leaves a company's own numbering alone", async () => {
    // Staff imported from an older payroll system. Those codes are theirs.
    await seedCompany(["1042", "1043"]);

    const res = await request("POST", "/v1/employees", newHire());

    expect(res.body.data.employeeCode).toBe("E-001");
  });

  it("still honours a code typed by hand", async () => {
    await seedCompany(["E-001"]);

    const res = await request("POST", "/v1/employees", newHire({ employeeCode: "ACC-77" }));

    expect(res.body.data.employeeCode).toBe("ACC-77");
  });

  it("does not read another company's numbers", async () => {
    // The generator queries a tenant subcollection; if it ever reached across
    // tenants, a busy neighbour would push this company's first hire to E-500.
    const other = `${cid}_other`;
    await db.collection("companies").doc(other).set({ name: "Someone else" });
    await db
      .collection("companies")
      .doc(other)
      .collection("employees")
      .doc("e_x")
      .set({ employeeCode: "E-500", firstName: "X", lastName: "Y", status: "ACTIVE" });
    await seedCompany(["E-001"]);

    const res = await request("POST", "/v1/employees", newHire());

    expect(res.body.data.employeeCode).toBe("E-002");
  });

  it("does not blank an existing code when an edit omits it", async () => {
    // The update route writes the whole document with set(). The form no
    // longer sends a code, so without carrying the old one across, editing
    // somebody's phone number would erase the number payroll knows them by.
    await seedCompany(["E-001"]);
    const created = await request("POST", "/v1/employees", newHire());
    const id = created.body.data.id as string;
    expect(created.body.data.employeeCode).toBe("E-002");

    const edited = await request("PUT", `/v1/employees/${id}`, {
      firstName: "Ali",
      lastName: "Rahimi",
      email: created.body.data.email,
      phone: "0700000000",
      employmentType: "FULL_TIME",
      joinDate: "2026-09-09",
    });

    expect(edited.status).toBe(200);
    expect(edited.body.data.employeeCode).toBe("E-002");
  });

  it("lets an edit change the code on purpose", async () => {
    await seedCompany(["E-001"]);
    const created = await request("POST", "/v1/employees", newHire());
    const id = created.body.data.id as string;

    const edited = await request("PUT", `/v1/employees/${id}`, {
      employeeCode: "E-050",
      firstName: "Ali",
      lastName: "Rahimi",
      email: created.body.data.email,
      employmentType: "FULL_TIME",
      joinDate: "2026-09-09",
    });

    expect(edited.body.data.employeeCode).toBe("E-050");
  });
});
