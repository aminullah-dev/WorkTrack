import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import {
  clientAddress,
  enforceRateLimit,
  type RateLimitRule,
} from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";
import { companySignupSchema, provisionCompany } from "../services/signup";

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
