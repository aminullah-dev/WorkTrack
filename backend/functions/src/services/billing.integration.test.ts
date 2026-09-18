import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { ORDERS, applyCallback } from "./billing";
import type { OrderDoc } from "./billing";
import { getLicense, setLicense } from "./license";
import type { WebhookPayload } from "../lib/hesab";

/**
 * Settling a payment.
 *
 * The callback is public and its signature only proves HesabPay signed a
 * timestamp, so everything that makes it safe lives here: one transaction id
 * settles one order ever, and the amount reported has to be the amount the
 * order asked for. These are the tests that say a captured callback is worth
 * nothing.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const TODAY = "2026-09-17";
let cid = "";
let seq = 0;

async function order(over: Partial<OrderDoc> = {}): Promise<string> {
  const id = ulid();
  const doc: Partial<OrderDoc> = {
    companyId: cid,
    companyName: "Paying Co",
    plan: "SILVER",
    term: "MONTHLY",
    months: 1,
    amountAfn: 3500,
    status: "PENDING",
    createdBy: "emp_1",
    createdByEmail: "admin@example.com",
    createdAt: new Date() as never,
    hesabSessionId: "sess_1",
    checkoutUrl: "https://pay.example/1",
    paidAt: null,
    transactionId: null,
    senderAccount: null,
    licenseBefore: null,
    licenseAfter: null,
    failureReason: null,
    ...over,
  };
  await db.collection(ORDERS).doc(id).set(doc);
  return id;
}

function paidCallback(orderId: string, over: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    success: true,
    status_code: 10,
    transaction_id: `tx_${orderId}`,
    amount: 3500,
    sender_account: "07XXXXXXXX",
    signature: "sig",
    timestamp: Math.floor(Date.now() / 1000),
    items: [{ id: orderId, name: "WorkTrack SILVER", price: 3500 }],
    ...over,
  };
}

async function orderStatus(id: string): Promise<OrderDoc> {
  const snap = await db.collection(ORDERS).doc(id).get();
  return snap.data() as OrderDoc;
}

describe.skipIf(!EMULATOR)("settling a HesabPay callback", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `bill_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({
      name: "Paying Co",
      status: "ACTIVE",
      settings: { profile: { timezone: "Asia/Kabul", currency: "AFN" } },
    });
    await setLicense(cid, {
      plan: "TRIAL",
      deviceLimit: 50,
      status: "ACTIVE",
      expiresAt: "2026-09-10",
      enforceDevices: false,
      enforcePlan: true,
    } as Parameters<typeof setLicense>[1]);
  });

  it("extends the licence and marks the order paid", async () => {
    const id = await order();
    const outcome = await applyCallback(paidCallback(id), TODAY);

    expect(outcome.result).toBe("PAID");
    const license = await getLicense(cid);
    expect(license.plan).toBe("SILVER");
    // The trial had already run out, so the month runs from today.
    expect(license.expiresAt).toBe("2026-10-17");
    expect(license.deviceLimit).toBe(75);
    expect(license.source).toBe("SELF_SERVE");

    const doc = await orderStatus(id);
    expect(doc.status).toBe("PAID");
    expect(doc.transactionId).toBe(`tx_${id}`);
    expect(doc.licenseBefore?.plan).toBe("TRIAL");
    expect(doc.licenseAfter?.plan).toBe("SILVER");
  });

  it("does not extend the licence twice for the same transaction", async () => {
    const id = await order();
    await applyCallback(paidCallback(id), TODAY);
    const first = await getLicense(cid);

    const again = await applyCallback(paidCallback(id), TODAY);
    expect(again.result).toBe("REPLAY");
    expect((await getLicense(cid)).expiresAt).toBe(first.expiresAt);
  });

  it("refuses a callback that reports a different amount", async () => {
    // A real callback for AFN 1 must not be replayable against a year of Gold.
    const id = await order();
    const outcome = await applyCallback(paidCallback(id, { amount: 1 }), TODAY);

    expect(outcome.result).toBe("FAILED");
    expect((await getLicense(cid)).plan).toBe("TRIAL");
    expect((await orderStatus(id)).status).toBe("FAILED");
  });

  it("will not settle one order with another order's transaction id", async () => {
    const paid = await order();
    await applyCallback(paidCallback(paid), TODAY);

    const second = await order({ plan: "GOLD", amountAfn: 7000 });
    const stolen = paidCallback(second, {
      transaction_id: `tx_${paid}`,
      amount: 7000,
    });
    expect((await applyCallback(stolen, TODAY)).result).toBe("REPLAY");
    expect((await orderStatus(second)).status).toBe("PENDING");
    expect((await getLicense(cid)).plan).toBe("SILVER");
  });

  it("records an explicit failure without touching the licence", async () => {
    const id = await order();
    const outcome = await applyCallback(
      { ...paidCallback(id), success: false, status_code: 0, message: "insufficient funds" },
      TODAY,
    );
    expect(outcome.result).toBe("FAILED");
    expect((await orderStatus(id)).failureReason).toContain("insufficient funds");
    expect((await getLicense(cid)).plan).toBe("TRIAL");
  });

  it("ignores a callback that is neither a success nor a failure", async () => {
    const id = await order();
    const outcome = await applyCallback(
      { ...paidCallback(id), success: undefined, status_code: 3 },
      TODAY,
    );
    expect(outcome.result).toBe("IGNORED");
    expect((await orderStatus(id)).status).toBe("PENDING");
  });

  it("ignores a callback for an order nobody has", async () => {
    const outcome = await applyCallback(paidCallback(ulid()), TODAY);
    expect(outcome.result).toBe("IGNORED");
  });

  it("carries the remaining days over when a company renews early", async () => {
    await setLicense(cid, {
      plan: "SILVER",
      deviceLimit: 75,
      status: "ACTIVE",
      expiresAt: "2026-12-01",
      enforceDevices: false,
      enforcePlan: true,
    } as Parameters<typeof setLicense>[1]);

    const id = await order({ plan: "SILVER", term: "YEARLY", months: 12, amountAfn: 35_000 });
    await applyCallback(paidCallback(id, { amount: 35_000 }), TODAY);

    expect((await getLicense(cid)).expiresAt).toBe("2027-12-01");
  });
});
