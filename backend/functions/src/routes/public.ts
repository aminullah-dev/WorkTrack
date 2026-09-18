import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import {
  clientAddress,
  enforceRateLimit,
  type RateLimitRule,
} from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";
import { companySignupSchema, provisionCompany } from "../services/signup";
import { hesabApiKey, hesabBase, hesabForwardUrl } from "../config";
import { forwardCallback } from "../lib/hesab";
import { settleWebhook } from "../services/billing";
import { clearPlanCache } from "../middleware/plan";
import { localDateOf } from "../services/attendance";

/**
 * Unauthenticated routes (mounted before the auth middleware). Keep this
 * surface minimal — only self-service company signup lives here.
 */
export const publicRouter = Router();

const HOUR = 60 * 60 * 1000;

/**
 * Signup creates a Firebase Auth user and eight Firestore documents per call,
 * with no credential required, so it is throttled three ways.
 *
 * The per-email limit is the one that protects a person: an attacker trying to
 * sign someone else's mailbox up repeatedly cannot vary that address. The
 * global limit is the one that protects the project — nothing a caller controls
 * can bypass it, so it bounds the worst case regardless of spoofing. The
 * per-address limit only spreads honest traffic; X-Forwarded-For is
 * caller-supplied and is not a security boundary on its own.
 */
const PER_EMAIL: RateLimitRule = { bucket: "signup_email", limit: 3, windowMs: HOUR };
const PER_ADDRESS: RateLimitRule = { bucket: "signup_addr", limit: 10, windowMs: HOUR };
const GLOBAL: RateLimitRule = { bucket: "signup_global", limit: 60, windowMs: HOUR };

publicRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    // Charged before the body is parsed, so malformed floods are throttled too.
    await enforceRateLimit(
      PER_ADDRESS,
      clientAddress(req),
      "Too many signup attempts from this network. Try again later.",
    );
    await enforceRateLimit(
      GLOBAL,
      "all",
      "Signups are temporarily throttled. Try again later.",
    );

    const input = parseBody(req, companySignupSchema);

    await enforceRateLimit(
      PER_EMAIL,
      input.email,
      "Too many signup attempts for this email address. Try again later.",
    );

    const result = await provisionCompany(input);
    res.status(201).json({ data: result });
  }),
);

/**
 * HesabPay's payment callback.
 *
 * Unauthenticated because HesabPay has no WorkTrack credential to present, and
 * safe for the same reason a bank statement is: nothing in the callback is
 * believed until HesabPay confirms its signature, its transaction id has never
 * settled an order before, and the amount matches the order it claims to pay.
 * See services/billing.ts.
 *
 * Always answers 200 once a callback has been dealt with — including a replay,
 * which is a no-op — so HesabPay stops retrying something already handled.
 */
const WEBHOOK: RateLimitRule = { bucket: "hesab_webhook", limit: 1000, windowMs: HOUR };

publicRouter.post(
  "/billing/hesab-webhook",
  asyncHandler(async (req, res) => {
    await enforceRateLimit(WEBHOOK, "all", "Too many payment callbacks.");

    const outcome = await settleWebhook({
      payload: req.body ?? {},
      apiKey: hesabApiKey.value(),
      baseUrl: hesabBase(),
      // The vendor's own date. A licence bought at 23:50 in Kabul gets the day
      // it was bought on, wherever the function happened to run.
      today: localDateOf(new Date(), "Asia/Kabul"),
    });

    if (outcome.result === "PAID") {
      // The guard caches entitlements for a minute; a company that has just
      // paid should not wait that long to be let back in.
      clearPlanCache(outcome.companyId);
      console.info("BILLING_PAID", {
        orderId: outcome.orderId,
        companyId: outcome.companyId,
        plan: outcome.license.plan,
        expiresAt: outcome.license.expiresAt,
      });
      res.json({ data: { result: outcome.result } });
      return;
    }

    if (outcome.result === "IGNORED") {
      // Not one of ours. It may belong to the other product sharing this
      // HesabPay account, which verifies the callback itself before believing
      // any of it.
      const forwarded = await forwardCallback(hesabForwardUrl.value(), req.body ?? {});
      console.warn("BILLING_CALLBACK_IGNORED", { reason: outcome.reason, forwarded });
      res.json({ data: { result: forwarded ? "FORWARDED" : "IGNORED" } });
      return;
    }

    res.json({ data: { result: outcome.result } });
  }),
);
