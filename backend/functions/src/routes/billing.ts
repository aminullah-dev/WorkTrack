import { Router } from "express";
import { hesabApiKey, hesabBaseUrl, portalBaseUrl } from "../config";
import { ApiError, asyncHandler } from "../lib/errors";
import { audit } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { localDateOf } from "../services/attendance";
import {
  billingOverview,
  checkoutSchema,
  getOrder,
  listOrders,
  orderToDto,
  startCheckout,
} from "../services/billing";
import { getSettings } from "../services/settings";

/**
 * The company's own plan and payments.
 *
 * Mounted before the device guard and the plan guard (see app.ts): a company
 * whose plan has lapsed must be able to reach the page that sells it a new one.
 *
 * Reading the plan needs no permission beyond being signed in — an employee
 * seeing which plan the company is on costs nothing, and the portal shows the
 * expiry warning to whoever is looking. Paying is administrator-only.
 */
export const billingRouter = Router();

/** The company's date, which is what an expiry is measured against. */
async function todayFor(cid: string): Promise<string> {
  const settings = await getSettings(cid);
  return localDateOf(new Date(), settings.profile.timezone);
}

billingRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await billingOverview(auth.companyId, await todayFor(auth.companyId)) });
  }),
);

billingRouter.post(
  "/checkout",
  requirePermission("billing:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const input = parseBody(req, checkoutSchema);
    const result = await startCheckout({
      cid: auth.companyId,
      actorId: auth.employeeId,
      input,
      apiKey: hesabApiKey.value(),
      baseUrl: hesabBaseUrl.value(),
      portalBaseUrl: portalBaseUrl.value(),
    });
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "billing.checkout",
      resourceType: "billingOrders",
      resourceId: result.orderId,
      after: { plan: input.plan, term: input.term, amountAfn: result.amountAfn },
    });
    res.status(201).json({ data: result });
  }),
);

billingRouter.get(
  "/orders",
  requirePermission("billing:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listOrders(auth.companyId) });
  }),
);

/**
 * One order, for the page the customer lands on when HesabPay sends them back.
 *
 * Scoped to the caller's own company: the id is a ULID, but an order is a
 * payment record and guessing one must not be enough to read it.
 */
billingRouter.get(
  "/orders/:orderId",
  requirePermission("billing:manage"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const found = await getOrder(req.params.orderId);
    if (!found || found.doc.companyId !== auth.companyId) {
      throw ApiError.notFound("Order not found");
    }
    res.json({ data: orderToDto(found.id, found.doc) });
  }),
);
