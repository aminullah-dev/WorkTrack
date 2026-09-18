import { describe, it, expect } from "vitest";
import {
  amountOf,
  forwardCallback,
  isConfigured,
  isFailSignal,
  isFresh,
  isPaidSignal,
  orderIdOf,
  timestampMs,
  transactionIdOf,
} from "./hesab";

describe("reading a HesabPay callback", () => {
  it("treats success:true and status_code 10 as paid", () => {
    expect(isPaidSignal({ success: true })).toBe(true);
    expect(isPaidSignal({ status_code: 10 })).toBe(true);
    expect(isPaidSignal({ status_code: "10" })).toBe(true);
    expect(isPaidSignal({ status: "PAID" })).toBe(true);
  });

  it("does not read an unknown callback as either outcome", () => {
    // An intermediate callback must be a no-op: reading "not obviously paid"
    // as failed would cancel orders that are still in flight.
    const pending = { status_code: 3, message: "processing" };
    expect(isPaidSignal(pending)).toBe(false);
    expect(isFailSignal(pending)).toBe(false);
  });

  it("reads an explicit failure", () => {
    expect(isFailSignal({ success: false })).toBe(true);
    expect(isFailSignal({ status: "CANCELLED" })).toBe(true);
  });

  it("takes the order id from the first item", () => {
    expect(orderIdOf({ items: [{ id: "01JABC", name: "x", price: 1 }] })).toBe("01JABC");
    expect(orderIdOf({ items: [] })).toBeNull();
    expect(orderIdOf({})).toBeNull();
  });

  it("accepts either spelling of the transaction id", () => {
    expect(transactionIdOf({ transaction_id: "t1" })).toBe("t1");
    expect(transactionIdOf({ transactionId: "t2" })).toBe("t2");
    expect(transactionIdOf({})).toBeNull();
  });

  it("reads the amount as a number, whichever way it is sent", () => {
    expect(amountOf({ amount: 3500 })).toBe(3500);
    expect(amountOf({ amount: "3500" })).toBe(3500);
    expect(amountOf({})).toBeNull();
  });
});

describe("callback freshness", () => {
  const now = Date.parse("2026-09-17T10:00:00Z");

  it("understands seconds and milliseconds", () => {
    expect(timestampMs(now)).toBe(now);
    expect(timestampMs(Math.floor(now / 1000))).toBe(now);
    expect(timestampMs("2026-09-17T10:00:00Z")).toBe(now);
  });

  it("accepts a recent callback and a retried one", () => {
    expect(isFresh(now, now)).toBe(true);
    expect(isFresh(Math.floor(now / 1000) - 3600, now)).toBe(true);
  });

  it("rejects one captured a month ago, and one with no timestamp", () => {
    expect(isFresh(Math.floor(now / 1000) - 30 * 86_400, now)).toBe(false);
    expect(isFresh(undefined, now)).toBe(false);
  });
});

describe("whether payment is set up at all", () => {
  it("accepts a real key", () => {
    expect(isConfigured("sk_live_abc123")).toBe(true);
  });

  it("treats nothing, and the deploy placeholder, as not set up", () => {
    // A project that is not selling yet still has to hold a secret, because
    // Firebase will not deploy a function that declares one it cannot find.
    expect(isConfigured("")).toBe(false);
    expect(isConfigured("   ")).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
    expect(isConfigured("not-configured")).toBe(false);
    expect(isConfigured("NOT-CONFIGURED")).toBe(false);
  });
});

describe("handing on a callback that is not ours", () => {
  const payload = { transaction_id: "t1", items: [{ id: "someone-elses" }] };

  it("posts the callback untouched and reports that it landed", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    expect(await forwardCallback("https://other/hook", payload, fake)).toBe(true);
    expect(seen!.url).toBe("https://other/hook");
    expect(seen!.body).toEqual(payload);
  });

  it("reports a refusal rather than claiming success", async () => {
    const fake = (async () => ({ ok: false, status: 404 }) as Response) as unknown as typeof fetch;
    expect(await forwardCallback("https://other/hook", payload, fake)).toBe(false);
  });

  it("swallows a network failure", async () => {
    // A callback we could not pass on is a line in the log, never a 500 for
    // HesabPay to retry against our own product.
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await forwardCallback("https://other/hook", payload, fake)).toBe(false);
  });

  it("does nothing when no other product shares the account", async () => {
    let called = false;
    const fake = (async () => {
      called = true;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    expect(await forwardCallback("", payload, fake)).toBe(false);
    expect(called).toBe(false);
  });
});
