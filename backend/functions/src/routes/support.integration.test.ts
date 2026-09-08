import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../lib/firestore";

/**
 * A customer raising an issue.
 *
 * This is the one place a tenant writes into the vendor's own data, so most of
 * these are about what they cannot do with it.
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
): Promise<{ status: number; body: Record<string, unknown> }> {
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

let cidA = "";
let cidB = "";
let seq = 0;

const asEmployee = (cid: string) => ({
  uid: "u_emp",
  cid,
  eid: "emp_1",
  r: ["EMPLOYEE"],
  email_verified: true,
});

async function wipeCrm(): Promise<void> {
  for (const c of ["crmAccounts", "crmTickets"]) {
    const snap = await db.collection(c).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
}

describe.skipIf(!EMULATOR)("raising an issue from the product", () => {
  beforeEach(async () => {
    seq += 1;
    cidA = `sup_a_${Date.now()}_${seq}`;
    cidB = `sup_b_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cidA).set({
      name: "Acme Kabul",
      license: { plan: "STANDARD", deviceLimit: 12, status: "ACTIVE", expiresAt: null, enforceDevices: true },
    });
    await db.collection("companies").doc(cidB).set({ name: "Beta Herat" });
    await wipeCrm();
    token.claims = asEmployee(cidA);
  });

  it("files the issue with the context the vendor would have had to ask for", async () => {
    const res = await request("POST", "/v1/support/tickets", {
      subject: "The app will not install on old phones",
      detail: "Three of our workers have Android 7.",
    });
    expect(res.status).toBe(201);

    const snap = await db.collection("crmTickets").get();
    expect(snap.size).toBe(1);
    const t = snap.docs[0].data();
    expect(t.subject).toBe("The app will not install on old phones");
    expect(t.companyId).toBe(cidA);
    expect(t.companyName).toBe("Acme Kabul");
    expect(t.plan).toBe("STANDARD"); // from the licence, not the request
    expect(t.seats).toBe(12);
    expect(t.raisedBy).toBe("emp_1");
    expect(t.source).toBe("PORTAL");
  });

  it("files a company that the vendor has not yet put in the CRM", async () => {
    // A customer writing in should not have to wait to have been filed first.
    await request("POST", "/v1/support/tickets", { subject: "Help" });

    const accounts = await db.collection("crmAccounts").get();
    expect(accounts.size).toBe(1);
    expect(accounts.docs[0].data().companyId).toBe(cidA);
    expect(accounts.docs[0].data().stage).toBe("WON");
  });

  it("does not make a second account for the same company", async () => {
    await request("POST", "/v1/support/tickets", { subject: "One" });
    await request("POST", "/v1/support/tickets", { subject: "Two" });

    expect((await db.collection("crmAccounts").get()).size).toBe(1);
    expect((await db.collection("crmTickets").get()).size).toBe(2);
  });

  it("ignores a status or priority the customer tries to set", async () => {
    // Otherwise every ticket arrives URGENT and the column stops meaning
    // anything.
    await request("POST", "/v1/support/tickets", {
      subject: "Urgent!",
      status: "RESOLVED",
      priority: "URGENT",
      accountId: "somebody-elses-account",
    });

    const t = (await db.collection("crmTickets").get()).docs[0].data();
    expect(t.status).toBe("OPEN");
    expect(t.priority).toBe("NORMAL");
    expect(t.accountId).not.toBe("somebody-elses-account");
  });

  it("shows a company only its own issues", async () => {
    await request("POST", "/v1/support/tickets", { subject: "Ours" });
    token.claims = asEmployee(cidB);
    await request("POST", "/v1/support/tickets", { subject: "Theirs" });

    const mine = (await request("GET", "/v1/support/tickets")).body.data as Array<
      Record<string, unknown>
    >;
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Theirs");
  });

  it("gives a receipt, not a window into the vendor's notes", async () => {
    await request("POST", "/v1/support/tickets", { subject: "Something" });
    // The vendor works on it privately.
    const id = (await db.collection("crmTickets").get()).docs[0].id;
    await db.collection("crmTickets").doc(id).set(
      { priority: "URGENT", resolution: "Their own router blocks us", detail: "internal" },
      { merge: true },
    );

    const row = ((await request("GET", "/v1/support/tickets")).body.data as Array<
      Record<string, unknown>
    >)[0];
    expect(Object.keys(row).sort()).toEqual(
      ["id", "openedAt", "resolvedAt", "status", "subject"].sort(),
    );
    expect(JSON.stringify(row)).not.toContain("router");
  });

  it("refuses an empty subject", async () => {
    expect((await request("POST", "/v1/support/tickets", { subject: "" })).status).toBe(422);
    expect((await db.collection("crmTickets").get()).size).toBe(0);
  });

  it("stops one company filling the console", async () => {
    // 20 an hour is generous for a real customer and useless for a script.
    let refused = 0;
    for (let i = 0; i < 24; i++) {
      const res = await request("POST", "/v1/support/tickets", { subject: `spam ${i}` });
      if (res.status === 429) refused += 1;
    }
    expect(refused).toBeGreaterThan(0);
    expect((await db.collection("crmTickets").get()).size).toBeLessThanOrEqual(20);
  });

  it("is closed to anyone without a token", async () => {
    token.claims = {};
    expect((await request("POST", "/v1/support/tickets", { subject: "x" })).status).toBe(401);
    expect((await request("GET", "/v1/support/tickets")).status).toBe(401);
  });
});
