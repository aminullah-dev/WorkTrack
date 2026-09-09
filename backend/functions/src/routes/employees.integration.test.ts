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

/**
 * A stand-in for Firebase Auth's user store.
 *
 * The Auth emulator would do, but the questions here are about what the route
 * ASKS of Auth — did it disable the account, did it rewrite the claims — and a
 * recording fake answers those directly instead of through a second service.
 */
const users = vi.hoisted(() => ({
  byId: new Map<string, any>(),
  revoked: [] as string[],
}));

vi.mock("firebase-admin/auth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getAuth: () => ({
      verifyIdToken: async () => {
        if (!token.claims.uid) throw new Error("no token");
        return token.claims;
      },
      getUser: async (uid: string) => {
        const u = users.byId.get(uid);
        if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
        return u;
      },
      getUserByEmail: async (email: string) => {
        const u = [...users.byId.values()].find((x) => x.email === email);
        if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
        return u;
      },
      createUser: async (u: any) => {
        users.byId.set(u.uid, { ...u, disabled: false, customClaims: {} });
        return users.byId.get(u.uid);
      },
      updateUser: async (uid: string, patch: any) => {
        if (patch.email && [...users.byId.values()].some((x) => x.uid !== uid && x.email === patch.email)) {
          throw Object.assign(new Error("taken"), { code: "auth/email-already-exists" });
        }
        Object.assign(users.byId.get(uid), patch);
        return users.byId.get(uid);
      },
      setCustomUserClaims: async (uid: string, claims: any) => {
        users.byId.get(uid).customClaims = claims;
      },
      revokeRefreshTokens: async (uid: string) => {
        users.revoked.push(uid);
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
    users.byId.clear();
    users.revoked = [];
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

/**
 * Editing an employee, and the account that edit is supposed to reach.
 *
 * Before this, PUT wrote Firestore and stopped. Everything below is a way the
 * record and the login could disagree while the screen said it had worked.
 */
describe.skipIf(!EMULATOR)("editing reaches the login", () => {
  let id = "";

  async function hire(over: Record<string, unknown> = {}): Promise<string> {
    const res = await request("POST", "/v1/employees", {
      ...newHire({ createLogin: true, initialPassword: "Passw0rd!", ...over }),
    });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  function edit(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      firstName: "Ali",
      lastName: "Rahimi",
      email: users.byId.get(id).email,
      employmentType: "FULL_TIME",
      joinDate: "2026-09-09",
      ...over,
    };
  }

  beforeEach(async () => {
    await seedCompany(["E-001"]);
    id = await hire();
  });

  it("moves the login when the email moves", async () => {
    // The bug this replaces: the record showed the new address and the person
    // went on signing in with the old one, with nothing saying so.
    const res = await request("PUT", `/v1/employees/${id}`, edit({ email: "moved@example.com" }));

    expect(res.status).toBe(200);
    expect(users.byId.get(id).email).toBe("moved@example.com");
  });

  it("refuses an email another account already holds", async () => {
    const other = await hire({ email: "taken@example.com" });
    expect(other).not.toBe(id);

    const res = await request("PUT", `/v1/employees/${id}`, edit({ email: "taken@example.com" }));

    expect(res.status).toBe(409);
    // And the record did not move either — Auth is updated first for exactly
    // this reason.
    expect(users.byId.get(id).email).not.toBe("taken@example.com");
  });

  it("shuts off access when somebody leaves", async () => {
    // The one that matters most: before this, EXITED changed a chip in a table
    // and the person kept every permission they had the day before.
    expect(users.byId.get(id).disabled).toBe(false);

    await request("PUT", `/v1/employees/${id}`, edit({ status: "EXITED" }));

    expect(users.byId.get(id).disabled).toBe(true);
    expect(users.revoked).toContain(id);
  });

  it("leaves somebody on leave able to sign in", async () => {
    // Still employed: they need their payslip and the leave that follows.
    await request("PUT", `/v1/employees/${id}`, edit({ status: "ON_LEAVE" }));

    expect(users.byId.get(id).disabled).toBe(false);
  });

  it("lets somebody come back", async () => {
    await request("PUT", `/v1/employees/${id}`, edit({ status: "SUSPENDED" }));
    expect(users.byId.get(id).disabled).toBe(true);

    await request("PUT", `/v1/employees/${id}`, edit({ status: "ACTIVE" }));
    expect(users.byId.get(id).disabled).toBe(false);
  });

  it("changes a role, in the claims and not only on paper", async () => {
    // The claims ARE the authorisation — the middleware reads them and never
    // opens the employee document.
    expect(users.byId.get(id).customClaims.r).toEqual(["EMPLOYEE"]);

    const res = await request("PUT", `/v1/employees/${id}`, edit({ role: "TEAM_LEAD" }));

    expect(res.status).toBe(200);
    expect(users.byId.get(id).customClaims.r).toEqual(["TEAM_LEAD"]);
    expect(users.revoked).toContain(id);
  });

  it("shows the new role back on the record, not just in the claims", async () => {
    // The portal cannot read a claim per row, so a role it cannot see is a
    // role nobody can correct.
    const res = await request("PUT", `/v1/employees/${id}`, edit({ role: "TEAM_LEAD" }));
    expect(res.body.data.role).toBe("TEAM_LEAD");

    const stored = await request("GET", `/v1/employees/${id}`);
    expect(stored.body.data.role).toBe("TEAM_LEAD");
  });

  it("moves the branch in the claims too", async () => {
    await request("PUT", `/v1/employees/${id}`, edit({ branchId: "b_herat" }));

    expect(users.byId.get(id).customClaims.b).toEqual(["b_herat"]);
  });

  it("refuses to mint a company administrator", async () => {
    const res = await request("PUT", `/v1/employees/${id}`, edit({ role: "COMPANY_ADMIN" }));

    // Two layers refuse this and the schema gets there first (422), which is
    // why the assertion is on the outcome rather than on which one spoke. The
    // guard in roleChangeRefusal still matters: it is what holds if the schema
    // ever gains a role the rules should not allow to be handed out.
    expect([403, 422]).toContain(res.status);
    expect(users.byId.get(id).customClaims.r).toEqual(["EMPLOYEE"]);
  });

  it("refuses an HR admin demoting the owner", async () => {
    // Every role in this request is assignable, so checking only the new role
    // would let it through — and afterwards the company has no owner.
    users.byId.get(id).customClaims = { cid, eid: id, r: ["COMPANY_ADMIN"], b: [] };

    const res = await request("PUT", `/v1/employees/${id}`, edit({ role: "EMPLOYEE" }));

    expect(res.status).toBe(403);
    expect(users.byId.get(id).customClaims.r).toEqual(["COMPANY_ADMIN"]);
  });

  it("refuses anybody changing their own role", async () => {
    token.claims = { uid: id, cid, eid: id, r: ["HR_ADMIN"], email_verified: true };

    const res = await request("PUT", `/v1/employees/${id}`, edit({ role: "AUDITOR" }));

    expect(res.status).toBe(403);
  });

  it("leaves the role alone when the edit does not mention it", async () => {
    // The form sends a whole document. Ordinary edits must not silently reset
    // somebody to EMPLOYEE.
    await request("PUT", `/v1/employees/${id}`, edit({ role: "TEAM_LEAD" }));
    expect(users.byId.get(id).customClaims.r).toEqual(["TEAM_LEAD"]);

    await request("PUT", `/v1/employees/${id}`, edit({ phone: "0700000000" }));

    expect(users.byId.get(id).customClaims.r).toEqual(["TEAM_LEAD"]);
  });

  it("says in the audit trail what happened to the account", async () => {
    await request("PUT", `/v1/employees/${id}`, edit({ status: "EXITED" }));

    const log = await db.collection(`companies/${cid}/auditLogs`).get();
    const actions = log.docs.map((d) => d.data().action as string);
    expect(actions.some((a) => a.includes("access revoked"))).toBe(true);
  });

  it("does not fall over for somebody who never had a login", async () => {
    // A company may hold records for people who never touch the app.
    const recordOnly = await request("POST", "/v1/employees", newHire({ createLogin: false }));
    const rid = recordOnly.body.data.id as string;

    const res = await request("PUT", `/v1/employees/${rid}`, {
      firstName: "No",
      lastName: "Login",
      email: recordOnly.body.data.email,
      employmentType: "FULL_TIME",
      joinDate: "2026-09-09",
      status: "EXITED",
    });

    expect(res.status).toBe(200);
  });

  afterEach(async () => {
    await db.recursiveDelete(db.collection("companies").doc(cid));
  });
});
