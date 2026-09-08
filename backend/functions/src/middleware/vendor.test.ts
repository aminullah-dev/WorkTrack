import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { ApiError } from "../lib/errors";

/**
 * The vendor boundary.
 *
 * Every other route in this API takes the company id from the token. The vendor
 * routes take it from the URL, so the only thing standing between a customer
 * and every other customer's data is this middleware. These are the attempts to
 * get past it.
 */

const verify = vi.hoisted(() => ({ impl: async (_t: string) => ({}) as Record<string, unknown> }));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: (t: string) => verify.impl(t) }),
}));

const { requireVendor } = await import("./vendor");

function call(
  claims: Record<string, unknown> | null,
  header = "Bearer token",
): Promise<{ err: ApiError | null; vendor: unknown }> {
  verify.impl = async () => {
    if (!claims) throw new Error("bad token");
    return { uid: "u1", ...claims };
  };
  const req = { header: () => header, vendor: undefined } as unknown as Request;
  return new Promise((resolve) => {
    void requireVendor(req, {} as Response, (err?: unknown) =>
      resolve({ err: (err as ApiError) ?? null, vendor: (req as Request).vendor }),
    );
  });
}

const VENDOR = { vendor: true, email: "staff@linumic.com", email_verified: true };

describe("the vendor boundary", () => {
  beforeEach(() => {
    verify.impl = async () => ({});
  });

  it("lets verified vendor staff through", async () => {
    const { err, vendor } = await call(VENDOR);
    expect(err).toBeNull();
    expect(vendor).toEqual({ uid: "u1", email: "staff@linumic.com" });
  });

  it("refuses a customer's company administrator", async () => {
    // The most valuable token an attacker actually has.
    const { err } = await call({
      cid: "acme",
      eid: "emp_1",
      r: ["COMPANY_ADMIN"],
      email_verified: true,
    });
    expect(err?.status).toBe(403);
  });

  it("refuses a token that merely claims a role named like ours", async () => {
    const { err } = await call({
      cid: "acme",
      eid: "emp_1",
      r: ["SUPER_ADMIN", "VENDOR"],
      email_verified: true,
    });
    expect(err?.status).toBe(403);
  });

  it("refuses an account that is BOTH staff and an employee", async () => {
    // A confused deputy: cross-tenant authority on an identity that also acts
    // inside a company. grant-vendor.ts refuses to create one; this refuses to
    // honour one however it came to exist.
    const { err } = await call({ ...VENDOR, cid: "acme", eid: "emp_1" });
    expect(err?.status).toBe(403);
  });

  it("refuses a vendor claim that is a string rather than true", async () => {
    // `"false"`, `"true"` and `1` are all truthy or coercible; the check is
    // strict equality for exactly this reason.
    for (const v of ["true", "false", 1, {}, [], "vendor"]) {
      const { err } = await call({ vendor: v, email_verified: true });
      expect(err?.status, `vendor=${JSON.stringify(v)}`).toBe(403);
    }
  });

  it("refuses staff who have not verified their address", async () => {
    const { err } = await call({ ...VENDOR, email_verified: false });
    expect(err?.status).toBe(403);
  });

  it("refuses a token with no vendor claim at all", async () => {
    const { err } = await call({ email_verified: true });
    expect(err?.status).toBe(403);
  });

  it("refuses an unsigned or expired token", async () => {
    const { err } = await call(null);
    expect(err?.status).toBe(401);
  });

  it("refuses a request with no Authorization header", async () => {
    const { err } = await call(VENDOR, "");
    expect(err?.status).toBe(401);
  });

  it("refuses a header that is not a bearer token", async () => {
    const { err } = await call(VENDOR, "Basic c3RhZmY6cGFzcw==");
    expect(err?.status).toBe(401);
  });

  it("does not tell a customer that this surface exists", async () => {
    // A distinctive message would confirm there is a vendor console to attack.
    const asCustomer = await call({ cid: "acme", eid: "e1", email_verified: true });
    const asNobody = await call({ email_verified: true });
    expect(asCustomer.err?.message).toBe(asNobody.err?.message);
  });
});
