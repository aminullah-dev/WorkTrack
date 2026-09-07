import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { audit, db } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  ACCOUNT_TYPES,
  computeTrialBalance,
  createAccount,
  listAccounts,
  listJournalEntries,
  postJournalEntry,
} from "../services/accounting";
import {
  createExpense,
  decideExpense,
  listExpenses,
} from "../services/expenses";
import { financeOverview } from "../services/finance-reports";

export const financeRouter = Router();

async function currencyOf(cid: string): Promise<string> {
  const snap = await db.collection("companies").doc(cid).get();
  const data = snap.data() as { currency?: string; settings?: { profile?: { currency?: string } } } | undefined;
  return data?.settings?.profile?.currency ?? data?.currency ?? "AFN";
}

// ------------------------------------------------------------------- overview

financeRouter.get(
  "/overview",
  requirePermission("finance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const currency = await currencyOf(auth.companyId);
    res.json({ data: await financeOverview(auth.companyId, currency) });
  }),
);

financeRouter.get(
  "/trial-balance",
  requirePermission("finance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await computeTrialBalance(auth.companyId) });
  }),
);

// ------------------------------------------------------------------- expenses

financeRouter.get(
  "/expenses",
  requirePermission("expenses:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ data: await listExpenses(auth.companyId, status) });
  }),
);

const expenseCreateSchema = z.object({
  category: z.enum(["rent", "utilities", "supplies", "travel", "services", "other"]),
  vendor: z.string().min(1).max(160),
  description: z.string().max(500).default(""),
  amount: z.number().positive().max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
});

financeRouter.post(
  "/expenses",
  requirePermission("expenses:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const body = parseBody(req, expenseCreateSchema);
    const currency = await currencyOf(auth.companyId);
    const expense = await createExpense(auth.companyId, { ...body, currency }, auth.employeeId);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "expenses.create",
      resourceType: "expenses",
      resourceId: expense.id,
      after: { vendor: expense.vendor, amount: expense.amount },
    });
    res.status(201).json({ data: expense });
  }),
);

const expenseDecideSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "PAY"]),
});

financeRouter.post(
  "/expenses/:id/decide",
  requirePermission("expenses:approve"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { action } = parseBody(req, expenseDecideSchema);
    const expense = await decideExpense(auth.companyId, req.params.id, action, auth.employeeId);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: `expenses.${action.toLowerCase()}`,
      resourceType: "expenses",
      resourceId: expense.id,
      after: { status: expense.status },
    });
    res.json({ data: expense });
  }),
);

// --------------------------------------------------------------------- ledger

financeRouter.get(
  "/accounts",
  requirePermission("ledger:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listAccounts(auth.companyId) });
  }),
);

const accountCreateSchema = z.object({
  code: z.string().regex(/^\d{3,6}$/, "Account code is 3–6 digits"),
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES as [string, ...string[]]),
});

financeRouter.post(
  "/accounts",
  requirePermission("ledger:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const body = parseBody(req, accountCreateSchema);
    const account = await createAccount(auth.companyId, {
      code: body.code,
      name: body.name,
      type: body.type as (typeof ACCOUNT_TYPES)[number],
    });
    res.status(201).json({ data: account });
  }),
);

financeRouter.get(
  "/journal",
  requirePermission("ledger:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listJournalEntries(auth.companyId) });
  }),
);

const journalLineSchema = z.object({
  accountCode: z.string().min(1),
  accountName: z.string().default(""),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
});

const journalCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  memo: z.string().min(1).max(300),
  lines: z.array(journalLineSchema).min(2),
});

financeRouter.post(
  "/journal",
  requirePermission("ledger:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const body = parseBody(req, journalCreateSchema);
    // Fill account names from the chart when the client omits them.
    const accounts = await listAccounts(auth.companyId);
    const nameByCode = new Map(accounts.map((a) => [a.code, a.name]));
    const lines = body.lines.map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName || nameByCode.get(l.accountCode) || l.accountCode,
      debit: l.debit,
      credit: l.credit,
    }));
    const id = await postJournalEntry(auth.companyId, {
      date: body.date,
      memo: body.memo,
      source: "MANUAL",
      createdBy: auth.employeeId,
      lines,
    });
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "ledger.journal.create",
      resourceType: "journalEntries",
      resourceId: id,
    });
    res.status(201).json({ data: { id } });
  }),
);
