import { z } from "zod";
import { db, nowTimestamp, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";

/**
 * The vendor's own record of the people it sells to.
 *
 * This is Linumic's data about its customers, not any customer's data, so it
 * lives in top-level collections outside every tenant. A company closing its
 * account purges its own tree; the vendor's memory of the deal survives that,
 * as it must for an invoice or a dispute.
 *
 * Flat collections rather than subcollections under an account, because the
 * questions that matter cut across accounts: what is due this week, what is
 * unpaid, which tickets are open. A subcollection per account would make each
 * of those a fan-out.
 *
 * An account may or may not point at a live tenant. Before the sale it does
 * not — that is the whole point of a pipeline — and `companyId` is filled in
 * when they become a customer.
 */

/* ------------------------------------------------------------------ accounts */

export const ACCOUNT_STAGES = [
  "LEAD",
  "CONTACTED",
  "DEMO",
  "QUOTED",
  "WON",
  "LOST",
  "DORMANT",
] as const;
export type AccountStage = (typeof ACCOUNT_STAGES)[number];

export const accountWriteSchema = z.object({
  name: z.string().min(1).max(120),
  stage: z.enum(ACCOUNT_STAGES).default("LEAD"),
  /** Set once they are a paying tenant; links this record to the live company. */
  companyId: z.string().max(64).nullish(),
  city: z.string().max(80).nullish(),
  industry: z.string().max(80).nullish(),
  /** Where they came from: a referral, the website, the demo, a visit. */
  source: z.string().max(80).nullish(),
  /** Their own estimate of headcount, before they are onboarded. */
  employeesEstimate: z.number().int().min(0).max(1_000_000).nullish(),
  /** The next thing the vendor must do, and when. The heart of following up. */
  nextActionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  nextAction: z.string().max(200).nullish(),
  notes: z.string().max(4000).nullish(),
});
export type AccountWrite = z.infer<typeof accountWriteSchema>;

/* ------------------------------------------------------------------ contacts */

export const contactWriteSchema = z.object({
  accountId: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  role: z.string().max(80).nullish(),
  /** Phone first: this market runs on calls, not email. */
  phone: z.string().max(40).nullish(),
  email: z.string().max(160).nullish(),
  /** The person decisions actually go through. */
  primary: z.boolean().default(false),
  notes: z.string().max(1000).nullish(),
});

/* ---------------------------------------------------------------- activities */

export const ACTIVITY_KINDS = ["CALL", "MEETING", "MESSAGE", "EMAIL", "VISIT", "NOTE"] as const;

export const activityWriteSchema = z.object({
  accountId: z.string().min(1).max(64),
  kind: z.enum(ACTIVITY_KINDS).default("NOTE"),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().min(1).max(2000),
  contactId: z.string().max(64).nullish(),
});

/* --------------------------------------------------------------------- deals */

export const DEAL_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;

export const dealWriteSchema = z.object({
  accountId: z.string().min(1).max(64),
  status: z.enum(DEAL_STATUSES).default("DRAFT"),
  plan: z.enum(["FREE", "STANDARD", "ENTERPRISE"]).default("STANDARD"),
  seats: z.number().int().min(1).max(100_000),
  /** AFN. There is no payment rail here; this is what was agreed, in writing. */
  amountAfn: z.number().min(0).max(1_000_000_000),
  /** MONTHLY or YEARLY — what the amount covers. */
  term: z.enum(["MONTHLY", "YEARLY", "ONE_OFF"]).default("YEARLY"),
  quotedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notes: z.string().max(2000).nullish(),
});

/* ------------------------------------------------------------------ invoices */

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;
export const PAYMENT_METHODS = ["BANK", "CASH", "HAWALA", "OTHER"] as const;

export const invoiceWriteSchema = z.object({
  accountId: z.string().min(1).max(64),
  number: z.string().min(1).max(40),
  status: z.enum(INVOICE_STATUSES).default("DRAFT"),
  amountAfn: z.number().min(0).max(1_000_000_000),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  method: z.enum(PAYMENT_METHODS).nullish(),
  /** Covers which period, in the vendor's own words. */
  period: z.string().max(80).nullish(),
  notes: z.string().max(1000).nullish(),
});

/* ------------------------------------------------------------------- tickets */

export const TICKET_STATUSES = ["OPEN", "WAITING", "RESOLVED"] as const;
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const ticketWriteSchema = z.object({
  accountId: z.string().min(1).max(64),
  subject: z.string().min(1).max(200),
  status: z.enum(TICKET_STATUSES).default("OPEN"),
  priority: z.enum(TICKET_PRIORITIES).default("NORMAL"),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resolvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  detail: z.string().max(4000).nullish(),
  resolution: z.string().max(4000).nullish(),
});

/* ------------------------------------------------------------------- storage */

/** The CRM's collections. Top-level: this is the vendor's data, not a tenant's. */
export type CrmCollection =
  | "crmAccounts"
  | "crmContacts"
  | "crmActivities"
  | "crmDeals"
  | "crmInvoices"
  | "crmTickets";

function col(name: CrmCollection): FirebaseFirestore.CollectionReference {
  return db.collection(name);
}

function shape(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    ...d,
    createdAt: toIso(d.createdAt ?? null),
    updatedAt: toIso(d.updatedAt ?? null),
  };
}

export async function create(
  collection: CrmCollection,
  data: Record<string, unknown>,
  actor: string,
): Promise<Record<string, unknown>> {
  const id = ulid();
  const now = nowTimestamp();
  await col(collection)
    .doc(id)
    .create({ ...data, createdBy: actor, createdAt: now, updatedAt: now });
  return shape(await col(collection).doc(id).get());
}

export async function update(
  collection: CrmCollection,
  id: string,
  data: Record<string, unknown>,
  actor: string,
): Promise<Record<string, unknown> | null> {
  const ref = col(collection).doc(id);
  if (!(await ref.get()).exists) return null;
  await ref.set({ ...data, updatedBy: actor, updatedAt: nowTimestamp() }, { merge: true });
  return shape(await ref.get());
}

export async function remove(collection: CrmCollection, id: string): Promise<boolean> {
  const ref = col(collection).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}

export async function get(
  collection: CrmCollection,
  id: string,
): Promise<Record<string, unknown> | null> {
  const doc = await col(collection).doc(id).get();
  return doc.exists ? shape(doc) : null;
}

/** Everything in a collection, or everything belonging to one account. */
export async function list(
  collection: CrmCollection,
  accountId?: string,
): Promise<Array<Record<string, unknown>>> {
  let q: FirebaseFirestore.Query = col(collection);
  if (accountId) q = q.where("accountId", "==", accountId);
  const snap = await q.limit(2000).get();
  return snap.docs.map(shape);
}

/**
 * Deleting an account takes its contacts, activities, deals, invoices and
 * tickets with it. Leaving them behind would keep them in every cross-account
 * view — unpaid invoices for a company that is no longer listed — with no way
 * to reach them.
 */
export async function deleteAccountCascade(accountId: string): Promise<number> {
  const children: CrmCollection[] = [
    "crmContacts",
    "crmActivities",
    "crmDeals",
    "crmInvoices",
    "crmTickets",
  ];
  let removed = 0;
  for (const c of children) {
    const snap = await col(c).where("accountId", "==", accountId).limit(2000).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
    removed += snap.size;
  }
  await col("crmAccounts").doc(accountId).delete();
  return removed;
}

/* ----------------------------------------------------------------- dashboard */

export interface CrmDashboard {
  /** Follow-ups whose date has arrived or passed. */
  dueNow: Array<Record<string, unknown>>;
  /** Follow-ups in the next seven days. */
  dueSoon: Array<Record<string, unknown>>;
  /** Sent but not paid, oldest first. */
  unpaidInvoices: Array<Record<string, unknown>>;
  openTickets: Array<Record<string, unknown>>;
  /** Count of accounts in each stage. */
  pipeline: Record<string, number>;
  /** AFN in quotes that have been sent but not decided. */
  openPipelineAfn: number;
  /** AFN invoiced and unpaid. */
  outstandingAfn: number;
}

export async function dashboard(todayIso: string): Promise<CrmDashboard> {
  const [accounts, invoices, tickets, deals] = await Promise.all([
    list("crmAccounts"),
    list("crmInvoices"),
    list("crmTickets"),
    list("crmDeals"),
  ]);

  const inSevenDays = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const withAction = accounts.filter((a) => typeof a.nextActionAt === "string");
  const dueNow = withAction
    .filter((a) => (a.nextActionAt as string) <= todayIso)
    .sort((a, b) => String(a.nextActionAt).localeCompare(String(b.nextActionAt)));
  const dueSoon = withAction
    .filter(
      (a) => (a.nextActionAt as string) > todayIso && (a.nextActionAt as string) <= inSevenDays,
    )
    .sort((a, b) => String(a.nextActionAt).localeCompare(String(b.nextActionAt)));

  const unpaidInvoices = invoices
    .filter((i) => i.status === "SENT")
    .sort((a, b) => String(a.dueAt ?? a.issuedAt).localeCompare(String(b.dueAt ?? b.issuedAt)));

  const openTickets = tickets
    .filter((t) => t.status !== "RESOLVED")
    .sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)));

  const pipeline: Record<string, number> = {};
  for (const stage of ACCOUNT_STAGES) pipeline[stage] = 0;
  for (const a of accounts) {
    const s = String(a.stage ?? "LEAD");
    pipeline[s] = (pipeline[s] ?? 0) + 1;
  }

  return {
    dueNow,
    dueSoon,
    unpaidInvoices,
    openTickets,
    pipeline,
    openPipelineAfn: deals
      .filter((d) => d.status === "SENT")
      .reduce((s, d) => s + Number(d.amountAfn ?? 0), 0),
    outstandingAfn: unpaidInvoices.reduce((s, i) => s + Number(i.amountAfn ?? 0), 0),
  };
}
