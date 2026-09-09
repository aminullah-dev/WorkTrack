import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { db, nowTimestamp, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { authOf } from "../middleware/auth";
import { enforceRateLimit, type RateLimitRule } from "../middleware/rateLimit";
import { parseBody } from "../middleware/validate";
import { getLicense } from "../services/license";

/**
 * How a customer reaches the vendor from inside the product.
 *
 * Until this existed they could only phone or email, and the vendor retyped
 * what they said into the console — losing the one thing that makes a support
 * message useful: which company, on what plan, running what. All of that is
 * attached here from the token and the licence, never from the request.
 *
 * This writes into the vendor's own CRM, which is the one place a tenant is
 * otherwise never allowed to touch. Three things keep that narrow:
 *
 *   - the company is taken from the caller's token, exactly like every other
 *     tenant route, so nobody can file against somebody else;
 *   - reads are filtered to the caller's own company, and there is no route
 *     here that returns anything else;
 *   - status, priority and the account link are the vendor's to set. A
 *     customer cannot mark their own ticket urgent, or resolved.
 */
export const supportRouter = Router();

const ticketCreateSchema = z.object({
  subject: z.string().min(1).max(200),
  detail: z.string().max(4000).optional(),
});

/** A tenant must not be able to fill the vendor's console. */
const PER_COMPANY: RateLimitRule = { bucket: "support", limit: 20, windowMs: 3_600_000 };

/**
 * The CRM account this company belongs to, created if the vendor has not made
 * one yet.
 *
 * A customer who writes in should not have to wait for the vendor to have
 * filed them first — and this quietly closes the gap where real customers were
 * missing from the pipeline entirely.
 */
async function accountFor(companyId: string, companyName: string): Promise<string> {
  const existing = await db
    .collection("crmAccounts")
    .where("companyId", "==", companyId)
    .limit(1)
    .get();
  if (!existing.empty) return existing.docs[0].id;

  const id = ulid();
  const now = nowTimestamp();
  await db.collection("crmAccounts").doc(id).set({
    name: companyName,
    stage: "WON", // they are a live tenant; they are not a lead
    companyId,
    createdBy: "support",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Raise an issue. */
supportRouter.post(
  "/tickets",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, ticketCreateSchema);

    await enforceRateLimit(
      PER_COMPANY,
      `support:${auth.companyId}`,
      "Too many issues raised in the last hour. Call us if it is urgent.",
    );

    const [companySnap, license] = await Promise.all([
      db.collection("companies").doc(auth.companyId).get(),
      getLicense(auth.companyId),
    ]);
    const companyName = (companySnap.data()?.name as string) ?? auth.companyId;

    const id = ulid();
    const now = nowTimestamp();
    await db.collection("crmTickets").doc(id).set({
      accountId: await accountFor(auth.companyId, companyName),
      subject: payload.subject,
      detail: payload.detail ?? null,
      // The vendor's to grade. A customer marking their own issue URGENT would
      // make the priority column meaningless within a week.
      status: "OPEN",
      priority: "NORMAL",
      openedAt: toIso(now)?.slice(0, 10) ?? null,
      resolvedAt: null,
      // The context the vendor would otherwise have to ask for.
      raisedBy: auth.employeeId,
      companyId: auth.companyId,
      companyName,
      plan: license.plan,
      seats: license.deviceLimit,
      source: "PORTAL",
      createdBy: auth.employeeId,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ data: { id, subject: payload.subject, status: "OPEN" } });
  }),
);

/** The caller's own company's issues, so they can see one was received. */
supportRouter.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snap = await db
      .collection("crmTickets")
      .where("companyId", "==", auth.companyId)
      .limit(100)
      .get();

    res.json({
      data: snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: d.id,
            subject: v.subject as string,
            status: v.status as string,
            openedAt: (v.openedAt as string) ?? null,
            resolvedAt: (v.resolvedAt as string) ?? null,
            // Deliberately not the vendor's internal notes, priority or
            // resolution text — this is a receipt, not a window into the CRM.
          };
        })
        .sort((a, b) => String(b.openedAt).localeCompare(String(a.openedAt))),
    });
  }),
);
