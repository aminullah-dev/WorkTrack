import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../lib/firestore";

/**
 * The vendor's CRM, through the real app.
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

const VENDOR = { uid: "vendor_1", vendor: true, email: "staff@linumic.com", email_verified: true };
const CUSTOMER = { uid: "u1", cid: "acme", eid: "e1", r: ["COMPANY_ADMIN"], email_verified: true };

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** The CRM lives outside every tenant, so each test starts from a clean slate. */
async function wipe(): Promise<void> {
  for (const c of [
    "crmAccounts",
    "crmContacts",
    "crmActivities",
    "crmDeals",
    "crmInvoices",
    "crmTickets",
  ]) {
    const snap = await db.collection(c).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
}

async function newAccount(over: Record<string, unknown> = {}): Promise<string> {
  const res = await request("POST", "/v1/vendor/crm/accounts", {
    name: "Kabul Textiles",
    stage: "LEAD",
    city: "Kabul",
    ...over,
  });
  expect(res.status).toBe(201);
  return String((res.body.data as Record<string, unknown>).id);
}

describe.skipIf(!EMULATOR)("the vendor CRM", () => {
  beforeEach(async () => {
    token.claims = { ...VENDOR };
    await wipe();
  });

  it("keeps a prospect before they are any kind of customer", async () => {
    // The whole point of a pipeline: a record with no tenant behind it.
    const id = await newAccount({ employeesEstimate: 45, source: "referral" });
    const row = (await request("GET", `/v1/vendor/crm/accounts/${id}`)).body.data as Record<
      string,
      unknown
    >;
    expect(row.name).toBe("Kabul Textiles");
    expect(row.stage).toBe("LEAD");
    expect(row.companyId ?? null).toBeNull();
    expect(row.createdBy).toBe("vendor_1");
  });

  it("moves an account along the pipeline and links it to the live tenant", async () => {
    const id = await newAccount();
    const res = await request("PUT", `/v1/vendor/crm/accounts/${id}`, {
      name: "Kabul Textiles",
      stage: "WON",
      companyId: "comp_kabul",
    });
    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>).stage).toBe("WON");
    expect((res.body.data as Record<string, unknown>).companyId).toBe("comp_kabul");
  });

  it("carries contacts, activities, deals, invoices and tickets for an account", async () => {
    const accountId = await newAccount();
    const made = [
      ["contacts", { accountId, name: "Ahmad", phone: "+93 700 000 000", primary: true }],
      ["activities", { accountId, kind: "CALL", at: day(0), summary: "Talked about seats" }],
      ["deals", { accountId, seats: 25, amountAfn: 60000, term: "YEARLY", status: "SENT" }],
      ["invoices", { accountId, number: "INV-001", amountAfn: 60000, issuedAt: day(-10), dueAt: day(-3), status: "SENT" }],
      ["tickets", { accountId, subject: "App will not install", openedAt: day(-1), priority: "HIGH" }],
    ] as const;

    for (const [path, payload] of made) {
      const res = await request("POST", `/v1/vendor/crm/${path}`, payload);
      expect(res.status, path).toBe(201);
    }

    for (const [path] of made) {
      const list = (await request("GET", `/v1/vendor/crm/${path}?accountId=${accountId}`)).body
        .data as unknown[];
      expect(list.length, path).toBe(1);
    }
  });

  it("filters by account rather than returning everybody's", async () => {
    const a = await newAccount({ name: "A" });
    const b = await newAccount({ name: "B" });
    await request("POST", "/v1/vendor/crm/activities", {
      accountId: a, kind: "CALL", at: day(0), summary: "for A",
    });
    await request("POST", "/v1/vendor/crm/activities", {
      accountId: b, kind: "CALL", at: day(0), summary: "for B",
    });

    const forA = (await request("GET", `/v1/vendor/crm/activities?accountId=${a}`)).body
      .data as Array<Record<string, unknown>>;
    expect(forA).toHaveLength(1);
    expect(forA[0].summary).toBe("for A");
  });

  it("shows what is due, what is owed and what is broken, in one call", async () => {
    const overdue = await newAccount({ name: "Overdue", nextActionAt: day(-2), nextAction: "Call back" });
    const soon = await newAccount({ name: "Soon", nextActionAt: day(3), nextAction: "Send quote" });
    await newAccount({ name: "Later", nextActionAt: day(30) });
    await newAccount({ name: "No action" });

    await request("POST", "/v1/vendor/crm/invoices", {
      accountId: overdue, number: "INV-1", amountAfn: 40000, issuedAt: day(-20), dueAt: day(-5), status: "SENT",
    });
    await request("POST", "/v1/vendor/crm/invoices", {
      accountId: soon, number: "INV-2", amountAfn: 15000, issuedAt: day(-2), status: "PAID", paidAt: day(-1), method: "HAWALA",
    });
    await request("POST", "/v1/vendor/crm/deals", {
      accountId: soon, seats: 10, amountAfn: 90000, status: "SENT",
    });
    await request("POST", "/v1/vendor/crm/tickets", {
      accountId: overdue, subject: "Cannot sign in", openedAt: day(-3),
    });

    const d = (await request("GET", "/v1/vendor/crm/dashboard")).body.data as Record<string, unknown>;

    expect((d.dueNow as unknown[]).length).toBe(1);
    expect((d.dueSoon as unknown[]).length).toBe(1);
    // Only the unpaid one, and only its amount.
    expect((d.unpaidInvoices as unknown[]).length).toBe(1);
    expect(d.outstandingAfn).toBe(40000);
    expect(d.openPipelineAfn).toBe(90000); // the sent quote, not the paid invoice
    expect((d.openTickets as unknown[]).length).toBe(1);
    expect((d.pipeline as Record<string, number>).LEAD).toBe(4);
  });

  it("deleting an account takes its records with it", async () => {
    // Otherwise an unpaid invoice would haunt the dashboard with no account to
    // open and no way to reach it.
    const accountId = await newAccount();
    await request("POST", "/v1/vendor/crm/invoices", {
      accountId, number: "INV-9", amountAfn: 1000, issuedAt: day(-1), status: "SENT",
    });
    await request("POST", "/v1/vendor/crm/tickets", {
      accountId, subject: "x", openedAt: day(-1),
    });

    expect((await request("DELETE", `/v1/vendor/crm/accounts/${accountId}`)).status).toBe(204);

    const d = (await request("GET", "/v1/vendor/crm/dashboard")).body.data as Record<string, unknown>;
    expect((d.unpaidInvoices as unknown[]).length).toBe(0);
    expect((d.openTickets as unknown[]).length).toBe(0);
    expect(d.outstandingAfn).toBe(0);
  });

  it("validates rather than storing whatever it is sent", async () => {
    const accountId = await newAccount();
    const bad = [
      ["accounts", { name: "", stage: "MAYBE" }],
      ["deals", { accountId, seats: 0, amountAfn: -5 }],
      ["invoices", { accountId, number: "", amountAfn: 1, issuedAt: "not-a-date" }],
      ["tickets", { accountId, subject: "x", openedAt: day(0), priority: "WHENEVER" }],
    ] as const;
    for (const [path, payload] of bad) {
      const res = await request("POST", `/v1/vendor/crm/${path}`, payload);
      expect(res.status, path).toBe(422);
    }
  });

  it("records every change against the person who made it", async () => {
    const id = await newAccount();
    await request("PUT", `/v1/vendor/crm/accounts/${id}`, { name: "Renamed", stage: "DEMO" });

    const log = await db.collection("vendorAuditLogs").get();
    const actions = log.docs.map((d) => d.data().action);
    expect(actions).toContain("crm.accounts.create");
    expect(actions).toContain("crm.accounts.update");
    expect(log.docs.every((d) => d.data().actorEmail === "staff@linumic.com")).toBe(true);
  });

  it("is shut to a customer's token, read and write alike", async () => {
    const id = await newAccount();
    token.claims = { ...CUSTOMER };

    for (const [m, p] of [
      ["GET", "/v1/vendor/crm/accounts"],
      ["GET", "/v1/vendor/crm/dashboard"],
      ["GET", `/v1/vendor/crm/accounts/${id}`],
      ["POST", "/v1/vendor/crm/accounts"],
      ["DELETE", `/v1/vendor/crm/accounts/${id}`],
    ] as const) {
      const res = await request(m, p, m === "POST" ? { name: "theirs" } : undefined);
      expect(res.status, `${m} ${p}`).toBe(403);
    }

    token.claims = { ...VENDOR };
    expect(((await request("GET", "/v1/vendor/crm/accounts")).body.data as unknown[]).length).toBe(1);
  });

  it("404s for something that is not there rather than inventing it", async () => {
    expect((await request("GET", "/v1/vendor/crm/accounts/nope")).status).toBe(404);
    expect(
      (await request("PUT", "/v1/vendor/crm/accounts/nope", { name: "x" })).status,
    ).toBe(404);
    expect((await request("DELETE", "/v1/vendor/crm/tickets/nope")).status).toBe(404);
  });
});
