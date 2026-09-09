import { Router } from "express";
import type { Request } from "express";
import { asyncHandler, ApiError } from "../lib/errors";
import { audit, db, nowTimestamp } from "../lib/firestore";
import { parseBody } from "../middleware/validate";
import { requireVendor, vendorOf } from "../middleware/vendor";
import { licenseWriteSchema, setLicense, getLicense } from "../services/license";
import { getCompany, listCompanies } from "../services/vendor";
import * as crm from "../services/crm";
import {
  accountWriteSchema,
  activityWriteSchema,
  contactWriteSchema,
  dealWriteSchema,
  invoiceWriteSchema,
  ticketWriteSchema,
} from "../services/crm";
import { localDateOf } from "../services/attendance";

/**
 * The vendor console's API: Linumic's own view across every customer.
 *
 * Every route here reads the company id from the URL rather than from the
 * caller's token — the opposite of the rest of this API, and the reason
 * requireVendor is as strict as it is. Nothing else in the product may be
 * mounted on this router.
 */
export const vendorRouter = Router();

vendorRouter.use(requireVendor);

/** The vendor's own date, used only to compute "days until expiry" for display. */
function today(): string {
  return localDateOf(new Date(), "Asia/Kabul");
}

/**
 * A record of what the vendor did, kept outside every tenant.
 *
 * The customer's own audit trail also gets the entry — a licence change is
 * something they are entitled to see — but that copy lives inside a tenant that
 * can be closed and purged. This one is the vendor's, and survives it.
 */
async function vendorAudit(entry: {
  actorUid: string;
  actorEmail: string | null;
  action: string;
  companyId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await db.collection("vendorAuditLogs").add({
      ...entry,
      before: entry.before ?? null,
      after: entry.after ?? null,
      at: nowTimestamp(),
    });
  } catch (e) {
    console.error("VENDOR_AUDIT_WRITE_FAILED", { action: entry.action, error: e });
  }
}

/** Every customer, with whatever is about to break listed first. */
vendorRouter.get(
  "/companies",
  asyncHandler(async (_req, res) => {
    res.json({ data: await listCompanies(today()) });
  }),
);

vendorRouter.get(
  "/companies/:companyId",
  asyncHandler(async (req, res) => {
    const row = await getCompany(req.params.companyId, today());
    if (!row) throw ApiError.notFound("Company not found");
    res.json({ data: row });
  }),
);

/**
 * Issue or change a licence.
 *
 * The same setLicense the CLI calls, so there is one implementation of what a
 * licence is and the console cannot drift from the script.
 */
vendorRouter.put(
  "/companies/:companyId/license",
  asyncHandler(async (req, res) => {
    const vendor = vendorOf(req);
    const { companyId } = req.params;
    const payload = parseBody(req, licenseWriteSchema);

    const company = await db.collection("companies").doc(companyId).get();
    if (!company.exists) throw ApiError.notFound("Company not found");

    const before = await getLicense(companyId);
    const after = await setLicense(companyId, payload);

    // Both trails: the customer's, because it is their licence, and the
    // vendor's, because it outlives their tenant.
    await Promise.all([
      audit(companyId, {
        actorId: vendor.uid,
        actorRole: "VENDOR",
        action: "license.update",
        resourceType: "companies",
        resourceId: companyId,
        before,
        after,
      }),
      vendorAudit({
        actorUid: vendor.uid,
        actorEmail: vendor.email,
        action: "license.update",
        companyId,
        before,
        after,
      }),
    ]);

    res.json({ data: after });
  }),
);

/** What the vendor has done, newest first. */
vendorRouter.get(
  "/audit",
  asyncHandler(async (_req, res) => {
    const snap = await db
      .collection("vendorAuditLogs")
      .orderBy("at", "desc")
      .limit(200)
      .get();
    res.json({
      data: snap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id,
          actorEmail: v.actorEmail ?? null,
          action: v.action,
          companyId: v.companyId,
          before: v.before ?? null,
          after: v.after ?? null,
          at: v.at?.toDate?.().toISOString() ?? null,
        };
      }),
    });
  }),
);

/** Confirms to the console that the token really is a vendor one. */
vendorRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const v = vendorOf(req);
    res.json({ data: { uid: v.uid, email: v.email, vendor: true } });
  }),
);

/* ---------------------------------------------------------------------- CRM */

/**
 * The vendor's own customer records.
 *
 * All six entities are the same shape of thing — a document with an owner, a
 * schema and an optional account — so they are mounted from one table rather
 * than written out six times. Divergence between them would be a bug, not a
 * feature.
 */
const CRM_ENTITIES = [
  { path: "accounts", collection: "crmAccounts", schema: accountWriteSchema },
  { path: "contacts", collection: "crmContacts", schema: contactWriteSchema },
  { path: "activities", collection: "crmActivities", schema: activityWriteSchema },
  { path: "deals", collection: "crmDeals", schema: dealWriteSchema },
  { path: "invoices", collection: "crmInvoices", schema: invoiceWriteSchema },
  { path: "tickets", collection: "crmTickets", schema: ticketWriteSchema },
] as const;

/** What the vendor did, so a disputed figure can be traced to a person. */
async function crmAudit(
  req: Request,
  action: string,
  id: string,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  const v = vendorOf(req);
  await vendorAudit({
    actorUid: v.uid,
    actorEmail: v.email,
    action,
    companyId: String((after as Record<string, unknown>)?.companyId ?? id),
    before,
    after,
  });
}

for (const entity of CRM_ENTITIES) {
  const base = `/crm/${entity.path}`;

  vendorRouter.get(
    base,
    asyncHandler(async (req, res) => {
      const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
      res.json({ data: await crm.list(entity.collection, accountId) });
    }),
  );

  vendorRouter.get(
    `${base}/:id`,
    asyncHandler(async (req, res) => {
      const row = await crm.get(entity.collection, req.params.id);
      if (!row) throw ApiError.notFound("Not found");
      res.json({ data: row });
    }),
  );

  vendorRouter.post(
    base,
    asyncHandler(async (req, res) => {
      const payload = parseBody(req, entity.schema);
      const row = await crm.create(entity.collection, payload, vendorOf(req).uid);
      await crmAudit(req, `crm.${entity.path}.create`, String(row.id), null, row);
      res.status(201).json({ data: row });
    }),
  );

  vendorRouter.put(
    `${base}/:id`,
    asyncHandler(async (req, res) => {
      const payload = parseBody(req, entity.schema);
      const before = await crm.get(entity.collection, req.params.id);
      const row = await crm.update(entity.collection, req.params.id, payload, vendorOf(req).uid);
      if (!row) throw ApiError.notFound("Not found");
      await crmAudit(req, `crm.${entity.path}.update`, req.params.id, before, row);
      res.json({ data: row });
    }),
  );

  vendorRouter.delete(
    `${base}/:id`,
    asyncHandler(async (req, res) => {
      const before = await crm.get(entity.collection, req.params.id);
      // Deleting an account takes its children with it; anything else is a
      // plain delete.
      const gone =
        entity.path === "accounts"
          ? ((await crm.deleteAccountCascade(req.params.id)), true)
          : await crm.remove(entity.collection, req.params.id);
      if (!gone) throw ApiError.notFound("Not found");
      await crmAudit(req, `crm.${entity.path}.delete`, req.params.id, before, null);
      res.status(204).send();
    }),
  );
}

/** Everything that needs the vendor's attention today, in one call. */
vendorRouter.get(
  "/crm/dashboard",
  asyncHandler(async (_req, res) => {
    res.json({ data: await crm.dashboard(today()) });
  }),
);
