import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, tenant } from "../lib/firestore";

/**
 * The vendor console, through the real Express app.
 *
 * The middleware tests prove a customer's token cannot reach these routes. This
 * proves the other half: that the routes do what they are for, that a vendor
 * token cannot reach the TENANT routes, and that the reach of the console is
 * bounded to company-level facts rather than anybody's staff.
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

/** Minimal request driver: enough to exercise the real middleware chain. */
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
const ADMIN = (cid: string) => ({
  uid: "u_admin",
  cid,
  eid: "emp_1",
  r: ["COMPANY_ADMIN"],
  email_verified: true,
});

let cidA = "";
let cidB = "";
let seq = 0;

describe.skipIf(!EMULATOR)("the vendor console", () => {
  beforeEach(async () => {
    seq += 1;
    cidA = `ven_a_${Date.now()}_${seq}`;
    cidB = `ven_b_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cidA).set({ name: "Acme Kabul", status: "ACTIVE" });
    await db.collection("companies").doc(cidB).set({
      name: "Beta Herat",
      status: "ACTIVE",
      license: { plan: "STANDARD", deviceLimit: 3, status: "ACTIVE", expiresAt: "2020-01-01", enforceDevices: true },
    });
    await tenant(cidA, "employees").doc("e1").set({ firstName: "A", lastName: "B", status: "ACTIVE" });
    await tenant(cidA, "devices").doc("d1").set({ status: "ACTIVE", type: "MOBILE" });
    await tenant(cidA, "devices").doc("d2").set({ status: "REVOKED", type: "MOBILE" });
    token.claims = { ...VENDOR };
  });

  it("lists every company with its licence and seat usage", async () => {
    const res = await request("GET", "/v1/vendor/companies");
    expect(res.status).toBe(200);

    const rows = res.body.data as Array<Record<string, unknown>>;
    const a = rows.find((r) => r.companyId === cidA)!;
    expect(a.name).toBe("Acme Kabul");
    expect(a.employeeCount).toBe(1);
    expect(a.devicesInUse).toBe(1); // the revoked one does not hold a seat
    expect((a.license as Record<string, unknown>).deviceLimit).toBe(5); // the default
  });

  it("puts whatever is about to break first", async () => {
    const rows = (await request("GET", "/v1/vendor/companies")).body.data as Array<
      Record<string, unknown>
    >;
    const expired = rows.findIndex((r) => r.companyId === cidB);
    const fine = rows.findIndex((r) => r.companyId === cidA);
    expect(expired).toBeLessThan(fine);
    expect(rows[expired].daysUntilExpiry as number).toBeLessThan(0);
  });

  it("issues a licence, and the customer's own audit trail records it", async () => {
    const res = await request("PUT", `/v1/vendor/companies/${cidA}/license`, {
      plan: "STANDARD",
      deviceLimit: 3,
      status: "ACTIVE",
      expiresAt: "2027-03-20",
      enforceDevices: true,
    });
    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>).deviceLimit).toBe(3);

    const stored = (await db.collection("companies").doc(cidA).get()).data()!;
    expect(stored.license.deviceLimit).toBe(3);
    expect(stored.license.enforceDevices).toBe(true);

    const trail = await tenant(cidA, "auditLogs").where("action", "==", "license.update").get();
    expect(trail.size).toBe(1);
    expect(trail.docs[0].data().actorRole).toBe("VENDOR");
  });

  it("keeps its own record, outside any tenant", async () => {
    // The customer's copy dies with their tenant; this one is the vendor's.
    await request("PUT", `/v1/vendor/companies/${cidA}/license`, {
      plan: "FREE", deviceLimit: 1, status: "ACTIVE", expiresAt: null, enforceDevices: false,
    });

    const log = await db.collection("vendorAuditLogs").where("companyId", "==", cidA).get();
    expect(log.size).toBe(1);
    const entry = log.docs[0].data();
    expect(entry.actorEmail).toBe("staff@linumic.com");
    expect(entry.before.deviceLimit).toBe(5);
    expect(entry.after.deviceLimit).toBe(1);
  });

  it("refuses a licence for a company that does not exist", async () => {
    const res = await request("PUT", "/v1/vendor/companies/no_such_company/license", {
      plan: "FREE", deviceLimit: 1, status: "ACTIVE", expiresAt: null, enforceDevices: false,
    });
    expect(res.status).toBe(404);
  });

  it("validates the licence body rather than storing anything sent", async () => {
    const res = await request("PUT", `/v1/vendor/companies/${cidA}/license`, {
      plan: "UNLIMITED", deviceLimit: -5, status: "WHATEVER", enforceDevices: "yes",
    });
    expect(res.status).toBe(422); // the house convention for a bad body
    const stored = (await db.collection("companies").doc(cidA).get()).data()!;
    expect(stored.license).toBeUndefined();
  });

  it("shuts a customer's token out of the console entirely", async () => {
    token.claims = ADMIN(cidA);
    for (const [method, path] of [
      ["GET", "/v1/vendor/companies"],
      ["GET", `/v1/vendor/companies/${cidB}`],
      ["GET", "/v1/vendor/audit"],
      ["GET", "/v1/vendor/me"],
    ] as const) {
      const res = await request(method, path);
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    const write = await request("PUT", `/v1/vendor/companies/${cidB}/license`, {
      plan: "ENTERPRISE", deviceLimit: 99999, status: "ACTIVE", expiresAt: null, enforceDevices: false,
    });
    expect(write.status).toBe(403);
    const untouched = (await db.collection("companies").doc(cidB).get()).data()!;
    expect(untouched.license.deviceLimit).toBe(3);
  });

  it("shuts a vendor token out of the tenant routes", async () => {
    // The other direction: cross-tenant authority must not become the ability
    // to act inside one company through the ordinary API.
    token.claims = { ...VENDOR };
    for (const path of ["/v1/me", "/v1/employees", "/v1/payroll/components"]) {
      const res = await request("GET", path);
      expect([401, 403], path).toContain(res.status);
    }
  });

  it("does not expose anybody's staff", async () => {
    // The console is bounded to company-level facts by what it queries. If that
    // ever changes, the privacy notice stops being true.
    const body = JSON.stringify((await request("GET", "/v1/vendor/companies")).body);
    expect(body).not.toContain("emp_1");
    expect(body).not.toMatch(/firstName|lastName|payslip|attendance/i);
  });
});
