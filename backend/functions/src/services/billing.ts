import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { addMonths } from "../lib/dates";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import {
  amountOf,
  createCheckoutSession,
  isFailSignal,
  isConfigured,
  isFresh,
  isPaidSignal,
  orderIdOf,
  transactionIdOf,
  verifyWebhookSignature,
} from "../lib/hesab";
import type { WebhookPayload } from "../lib/hesab";
import {
  countActiveEmployees,
  entitlementsOf,
  getLicense,
  isDeviceActive,
  licenseStanding,
  normalizeLicense,
} from "./license";
import type { DeviceDoc, License } from "./license";
import { PLAN_IDS, TERMS, planCatalog, priceOf } from "./plans";
import type { PlanId, TermId } from "./plans";

/**
 * Selling the plans.
 *
 * A company administrator picks a plan, pays through HesabPay, and the licence
 * extends itself. Three things make that safe to do from a public callback:
 *
 *   1. HesabPay is asked to verify the callback's signature before anything in
 *      it is believed.
 *   2. A transaction id settles exactly one order, ever — recorded in the same
 *      Firestore transaction that marks the order paid, so a replayed callback
 *      cannot extend a licence twice.
 *   3. The amount HesabPay reports must equal what the order asked for. A
 *      captured callback for AFN 1 cannot buy a year of Gold.
 *
 * Orders live outside the tenant, in a root collection. The vendor needs to see
 * what a company paid after that company's account is closed and its tree
 * purged, and an invoice that disappears with the customer is not a record.
 */

export const ORDERS = "billingOrders";
/** One document per settled HesabPay transaction. The replay guard. */
const WEBHOOK_GUARD = "billingWebhooks";

export type OrderStatus = "PENDING" | "PAID" | "FAILED";

export interface OrderDoc {
  companyId: string;
  companyName: string;
  plan: PlanId;
  term: TermId;
  months: number;
  amountAfn: number;
  status: OrderStatus;
  createdBy: string;
  createdByEmail: string | null;
  createdAt: Timestamp;
  hesabSessionId: string | null;
  checkoutUrl: string | null;
  paidAt: Timestamp | null;
  transactionId: string | null;
  senderAccount: string | null;
  /** What the licence said before and after this order settled. */
  licenseBefore: License | null;
  licenseAfter: License | null;
  failureReason: string | null;
}

export interface OrderDto {
  id: string;
  companyId: string;
  plan: PlanId;
  term: TermId;
  months: number;
  amountAfn: number;
  status: OrderStatus;
  createdAt: string | null;
  paidAt: string | null;
  transactionId: string | null;
  checkoutUrl: string | null;
}

export function orderToDto(id: string, d: OrderDoc): OrderDto {
  return {
    id,
    companyId: d.companyId,
    plan: d.plan,
    term: d.term,
    months: d.months,
    amountAfn: d.amountAfn,
    status: d.status,
    createdAt: toIso(d.createdAt),
    paidAt: toIso(d.paidAt),
    transactionId: d.transactionId,
    // Only worth showing while it can still be used.
    checkoutUrl: d.status === "PENDING" ? d.checkoutUrl : null,
  };
}

export const checkoutSchema = z.object({
  plan: z.enum(["BRONZE", "SILVER", "GOLD"]),
  term: z.enum(["MONTHLY", "YEARLY"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ------------------------------------------------------------------ the offer

export interface PlanCardDto {
  id: PlanId;
  priceAfn: number;
  yearlyAfn: number;
  employeeLimit: number;
  deviceLimit: number;
  features: string[];
  purchasable: boolean;
  /** Why this plan cannot be bought right now, if it cannot. */
  blockedReason: "EMPLOYEES" | "DEVICES" | null;
}

export interface BillingOverview {
  plans: PlanCardDto[];
  current: {
    plan: PlanId;
    status: License["status"];
    state: ReturnType<typeof licenseStanding>["state"];
    expiresAt: string | null;
    graceEndsAt: string | null;
    daysLeft: number | null;
    enforced: boolean;
    features: string[];
    employeeLimit: number;
    deviceLimit: number;
    employeesInUse: number;
    devicesInUse: number;
  };
}

/**
 * The price list, with the plans this company cannot move to marked.
 *
 * A company with 40 people on the books cannot be sold a 20-person plan: the
 * refusal belongs here, before the money moves, not afterwards when the licence
 * would have to strand sixteen employees or be refunded.
 */
export async function billingOverview(cid: string, today: string): Promise<BillingOverview> {
  const [license, catalog, employeesInUse, deviceSnap] = await Promise.all([
    getLicense(cid),
    planCatalog(),
    countActiveEmployees(cid),
    tenant(cid, "devices").limit(1000).get(),
  ]);
  const devicesInUse = deviceSnap.docs.filter((d) => isDeviceActive(d.data() as DeviceDoc)).length;
  const ent = await entitlementsOf(license);
  const standing = licenseStanding(license, today);

  const plans: PlanCardDto[] = PLAN_IDS.map((id) => catalog[id])
    .filter((p) => p.purchasable)
    .map((p) => ({
      id: p.id,
      priceAfn: p.priceAfn,
      yearlyAfn: priceOf(p, "YEARLY"),
      employeeLimit: p.employeeLimit,
      deviceLimit: p.deviceLimit,
      features: p.features,
      purchasable: true,
      blockedReason:
        employeesInUse > p.employeeLimit
          ? "EMPLOYEES"
          : devicesInUse > p.deviceLimit
            ? "DEVICES"
            : null,
    }));

  return {
    plans,
    current: {
      plan: license.plan,
      status: license.status,
      state: standing.state,
      expiresAt: license.expiresAt,
      graceEndsAt: standing.graceEndsAt,
      daysLeft: standing.daysLeft,
      enforced: license.enforcePlan,
      features: ent.features,
      employeeLimit: ent.employeeLimit,
      deviceLimit: ent.deviceLimit,
      employeesInUse,
      devicesInUse,
    },
  };
}

// --------------------------------------------------------------- the checkout

export interface CheckoutResult {
  orderId: string;
  checkoutUrl: string;
  amountAfn: number;
}

/**
 * Creates the order, then asks HesabPay for a checkout link for it.
 *
 * The order is written first so that a session created against an id that was
 * never stored cannot exist: the callback would then arrive for an order
 * nobody can find, which is a payment taken and not credited.
 */
export async function startCheckout(opts: {
  cid: string;
  actorId: string;
  input: CheckoutInput;
  apiKey: string;
  baseUrl: string;
  portalBaseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<CheckoutResult> {
  const { cid, actorId, input } = opts;
  if (!isConfigured(opts.apiKey)) {
    throw new ApiError(
      503,
      ErrorCodes.INTERNAL,
      "Online payment is not configured yet. Contact Linumic to pay another way.",
    );
  }

  const catalog = await planCatalog();
  const plan = catalog[input.plan];
  const term = TERMS[input.term];
  const amountAfn = priceOf(plan, input.term);

  const [employeesInUse, deviceSnap, company, employee] = await Promise.all([
    countActiveEmployees(cid),
    tenant(cid, "devices").limit(1000).get(),
    db.collection("companies").doc(cid).get(),
    tenant(cid, "employees").doc(actorId).get(),
  ]);
  const devicesInUse = deviceSnap.docs.filter((d) => isDeviceActive(d.data() as DeviceDoc)).length;

  if (employeesInUse > plan.employeeLimit) {
    throw ApiError.business(
      ErrorCodes.PLAN_LIMIT_REACHED,
      `This company has ${employeesInUse} active employees; that plan covers ${plan.employeeLimit}. Choose a larger plan.`,
    );
  }
  if (devicesInUse > plan.deviceLimit) {
    throw ApiError.business(
      ErrorCodes.PLAN_LIMIT_REACHED,
      `This company has ${devicesInUse} registered devices; that plan covers ${plan.deviceLimit}. Choose a larger plan.`,
    );
  }

  const orderId = ulid();
  const companyName = (company.data()?.name as string | undefined) ?? "WorkTrack";
  const email = (employee.data()?.email as string | undefined) ?? null;
  const order: OrderDoc = {
    companyId: cid,
    companyName,
    plan: plan.id,
    term: input.term,
    months: term.months,
    amountAfn,
    status: "PENDING",
    createdBy: actorId,
    createdByEmail: email,
    createdAt: nowTimestamp(),
    hesabSessionId: null,
    checkoutUrl: null,
    paidAt: null,
    transactionId: null,
    senderAccount: null,
    licenseBefore: null,
    licenseAfter: null,
    failureReason: null,
  };
  await db.collection(ORDERS).doc(orderId).set(order);

  try {
    const session = await createCheckoutSession({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      // HesabPay wants an address for the receipt. The administrator's own is
      // the right one; a company that has none still gets a valid address.
      email: email ?? `billing+${cid}@worktrack.af`,
      item: {
        id: orderId,
        name: `WorkTrack ${plan.id} — ${term.months} month(s) — ${companyName}`,
        price: amountAfn,
      },
      successUrl: `${opts.portalBaseUrl}/billing?order=${orderId}&result=success`,
      failureUrl: `${opts.portalBaseUrl}/billing?order=${orderId}&result=failure`,
      fetchImpl: opts.fetchImpl,
    });
    await db.collection(ORDERS).doc(orderId).update({
      hesabSessionId: session.sessionId,
      checkoutUrl: session.url,
    });
    return { orderId, checkoutUrl: session.url, amountAfn };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db
      .collection(ORDERS)
      .doc(orderId)
      .update({ status: "FAILED", failureReason: reason });
    console.error("CHECKOUT_SESSION_FAILED", { cid, orderId, reason });
    throw new ApiError(
      502,
      ErrorCodes.INTERNAL,
      "HesabPay could not open a payment page just now. Try again in a moment.",
    );
  }
}

// ------------------------------------------------------------- the settlement

/** What a purchase does to the licence. Pure, so the arithmetic is testable. */
export function licenseAfterPurchase(opts: {
  current: License;
  plan: PlanId;
  months: number;
  planDeviceLimit: number;
  today: string;
}): License {
  const { current, plan, months, planDeviceLimit, today } = opts;
  // Unused days are carried over rather than burned: a company that renews
  // early is doing exactly what we want, and charging it a week for the
  // privilege teaches it to renew late instead.
  const from = current.expiresAt && current.expiresAt > today ? current.expiresAt : today;
  return {
    ...current,
    plan,
    expiresAt: addMonths(from, months),
    status: "ACTIVE",
    // Never below what the vendor granted by hand: a purchase adds, it does not
    // quietly take a seat away that somebody negotiated.
    deviceLimit: Math.max(current.deviceLimit, planDeviceLimit),
    enforcePlan: true,
    source: "SELF_SERVE",
  };
}

export type SettlementOutcome =
  | { result: "PAID"; orderId: string; companyId: string; license: License }
  | { result: "REPLAY"; orderId: string }
  | { result: "FAILED"; orderId: string }
  | { result: "IGNORED"; reason: string };

/**
 * Applies a verified HesabPay callback.
 *
 * Verification of the signature happens in `settleWebhook`; this is the part
 * that touches data, kept separate so the whole settlement can be tested
 * against the emulator without a network.
 */
export async function applyCallback(
  payload: WebhookPayload,
  today: string,
): Promise<SettlementOutcome> {
  const orderId = orderIdOf(payload) ?? payload.session_id ?? null;
  if (!orderId) return { result: "IGNORED", reason: "no order id in callback" };

  const paid = isPaidSignal(payload);
  const failed = isFailSignal(payload);
  if (!paid && !failed) return { result: "IGNORED", reason: "neither a success nor a failure" };

  const orderRef = db.collection(ORDERS).doc(orderId);
  const transactionId = transactionIdOf(payload);

  if (failed) {
    const snap = await orderRef.get();
    if (!snap.exists) return { result: "IGNORED", reason: "unknown order" };
    if ((snap.data() as OrderDoc).status === "PENDING") {
      await orderRef.update({
        status: "FAILED",
        transactionId,
        failureReason: String(payload.message ?? "HesabPay reported a failed payment"),
      });
    }
    return { result: "FAILED", orderId };
  }

  if (!transactionId) return { result: "IGNORED", reason: "paid callback with no transaction id" };
  const guardRef = db.collection(WEBHOOK_GUARD).doc(transactionId);

  // Read the catalogue before the transaction: a transaction may not wait on
  // anything but its own reads.
  const orderPeek = await orderRef.get();
  if (!orderPeek.exists) return { result: "IGNORED", reason: "unknown order" };
  const peek = orderPeek.data() as OrderDoc;
  const catalog = await planCatalog();
  const planDeviceLimit = catalog[peek.plan].deviceLimit;
  const companyRef = db.collection("companies").doc(peek.companyId);

  return db.runTransaction(async (tx) => {
    const [guard, orderSnap, companySnap] = await Promise.all([
      tx.get(guardRef),
      tx.get(orderRef),
      tx.get(companyRef),
    ]);

    // One transaction id settles one order, ever. This is what makes a captured
    // callback worthless, and it is checked inside the transaction so two
    // deliveries racing each other cannot both pass it.
    if (guard.exists) return { result: "REPLAY", orderId } as SettlementOutcome;

    const order = orderSnap.data() as OrderDoc;
    const reported = amountOf(payload);
    if (reported === null || Math.round(reported) !== order.amountAfn) {
      // Bound to the amount, so a real callback for a small payment cannot be
      // replayed against an expensive order.
      tx.create(guardRef, {
        orderId,
        companyId: order.companyId,
        at: nowTimestamp(),
        rejected: "AMOUNT_MISMATCH",
        reported,
        expected: order.amountAfn,
      });
      tx.update(orderRef, {
        status: "FAILED",
        transactionId,
        failureReason: `HesabPay reported ${reported} AFN for an order of ${order.amountAfn} AFN`,
      });
      return { result: "FAILED", orderId } as SettlementOutcome;
    }

    if (order.status === "PAID") return { result: "REPLAY", orderId } as SettlementOutcome;

    const current = normalizeLicense(companySnap.data()?.license as Partial<License> | undefined);
    const license = licenseAfterPurchase({
      current,
      plan: order.plan,
      months: order.months,
      planDeviceLimit,
      today,
    });

    tx.create(guardRef, {
      orderId,
      companyId: order.companyId,
      at: nowTimestamp(),
      amountAfn: order.amountAfn,
    });
    tx.update(orderRef, {
      status: "PAID",
      paidAt: nowTimestamp(),
      transactionId,
      senderAccount: String(payload.sender_account ?? "") || null,
      licenseBefore: current,
      licenseAfter: license,
    });
    tx.set(companyRef, { license, updatedAt: nowTimestamp() }, { merge: true });

    return { result: "PAID", orderId, companyId: order.companyId, license } as SettlementOutcome;
  });
}

/** Verifies the callback with HesabPay, then applies it. */
export async function settleWebhook(opts: {
  payload: WebhookPayload;
  apiKey: string;
  baseUrl: string;
  today: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<SettlementOutcome> {
  const { payload } = opts;
  if (!payload.signature || payload.timestamp === undefined) {
    throw ApiError.validation("The callback carried no signature");
  }
  if (!isFresh(payload.timestamp, opts.nowMs ?? Date.now())) {
    // Checked here rather than left to HesabPay: a pair captured last month
    // should cost nothing to reject, and it must be rejected even if their
    // endpoint one day stops looking at age.
    throw ApiError.permissionDenied("The callback is too old to act on");
  }
  const valid = await verifyWebhookSignature({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signature: String(payload.signature),
    timestamp: payload.timestamp,
    fetchImpl: opts.fetchImpl,
  });
  if (!valid) throw ApiError.permissionDenied("The callback signature is not valid");

  return applyCallback(payload, opts.today);
}

// ----------------------------------------------------------------- the ledger

export async function listOrders(cid: string, limit = 50): Promise<OrderDto[]> {
  const snap = await db
    .collection(ORDERS)
    .where("companyId", "==", cid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => orderToDto(d.id, d.data() as OrderDoc));
}

export async function getOrder(orderId: string): Promise<{ id: string; doc: OrderDoc } | null> {
  const snap = await db.collection(ORDERS).doc(orderId).get();
  if (!snap.exists) return null;
  return { id: snap.id, doc: snap.data() as OrderDoc };
}
