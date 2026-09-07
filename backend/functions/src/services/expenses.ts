import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "../lib/errors";
import { db, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { buildJournalEntry } from "./accounting";

/**
 * Company expenses & vendor bills. Lifecycle: DRAFT → APPROVED → PAID, or
 * DRAFT → REJECTED. Approving posts a journal entry (Dr expense / Cr Accounts
 * Payable); paying posts the settlement (Dr Accounts Payable / Cr Cash), so the
 * general ledger and finance reports stay in sync automatically.
 */

export type ExpenseStatus = "DRAFT" | "APPROVED" | "REJECTED" | "PAID";

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "supplies"
  | "travel"
  | "services"
  | "other";

/** Expense category → chart-of-accounts expense code. */
const CATEGORY_ACCOUNT: Record<ExpenseCategory, string> = {
  rent: "5100",
  utilities: "5200",
  supplies: "5300",
  travel: "5400",
  services: "5900",
  other: "5900",
};

const CATEGORY_NAME: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  supplies: "Office Supplies",
  travel: "Travel & Transport",
  services: "Other Expenses",
  other: "Other Expenses",
};

const PAYABLE_CODE = "2000";
const PAYABLE_NAME = "Accounts Payable";
const CASH_CODE = "1010";
const CASH_NAME = "Bank";

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  status: ExpenseStatus;
  accountCode: string;
  createdBy: string;
  createdAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

function toDto(id: string, v: Record<string, unknown>): ExpenseDto {
  return {
    id,
    category: (v.category as ExpenseCategory) ?? "other",
    vendor: (v.vendor as string) ?? "",
    description: (v.description as string) ?? "",
    amount: (v.amount as number) ?? 0,
    currency: (v.currency as string) ?? "AFN",
    date: (v.date as string) ?? "",
    status: (v.status as ExpenseStatus) ?? "DRAFT",
    accountCode: (v.accountCode as string) ?? "5900",
    createdBy: (v.createdBy as string) ?? "",
    createdAt: toIso((v.createdAt as Timestamp | null | undefined) ?? null),
    decidedBy: (v.decidedBy as string | null) ?? null,
    decidedAt: toIso((v.decidedAt as Timestamp | null | undefined) ?? null),
  };
}

export async function listExpenses(cid: string, status?: string): Promise<ExpenseDto[]> {
  const snap = await tenant(cid, "expenses").get();
  return snap.docs
    .map((d) => toDto(d.id, d.data() as Record<string, unknown>))
    .filter((e) => !status || e.status === status)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function createExpense(
  cid: string,
  input: {
    category: ExpenseCategory;
    vendor: string;
    description: string;
    amount: number;
    currency: string;
    date: string;
  },
  actorId: string,
): Promise<ExpenseDto> {
  const id = ulid();
  const doc = {
    companyId: cid,
    category: input.category,
    vendor: input.vendor,
    description: input.description,
    amount: Math.round(input.amount * 100) / 100,
    currency: input.currency,
    date: input.date,
    status: "DRAFT" as ExpenseStatus,
    accountCode: CATEGORY_ACCOUNT[input.category],
    createdBy: actorId,
    createdAt: nowTimestamp(),
    decidedBy: null,
    decidedAt: null,
  };
  await tenant(cid, "expenses").doc(id).set(doc);
  return toDto(id, doc);
}

/**
 * Advances an expense through its lifecycle and posts the matching ledger entry.
 * APPROVE (from DRAFT) → Dr expense / Cr payable. PAY (from APPROVED) → Dr
 * payable / Cr cash. REJECT (from DRAFT) → no ledger impact.
 */
export async function decideExpense(
  cid: string,
  id: string,
  action: "APPROVE" | "REJECT" | "PAY",
  actorId: string,
): Promise<ExpenseDto> {
  const ref = tenant(cid, "expenses").doc(id);
  const journal = tenant(cid, "journalEntries");

  // The status guard, the status write and the ledger entry commit together.
  // As separate round trips, two approvers could both read DRAFT, both pass the
  // guard and both post the entry — double-relieving Accounts Payable. And
  // because the status landed before the ledger write, a failure in between
  // left an expense marked APPROVED with nothing in the ledger and no way to
  // retry, since the state machine rejects a second attempt.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw ApiError.notFound("Expense not found");
    const expense = toDto(id, snap.data() as Record<string, unknown>);

    const valid: Record<string, ExpenseStatus> = { APPROVE: "DRAFT", REJECT: "DRAFT", PAY: "APPROVED" };
    if (expense.status !== valid[action]) {
      throw ApiError.business(
        "INVALID_STATE",
        `Cannot ${action.toLowerCase()} an expense in status ${expense.status}`,
      );
    }

    const nextStatus: ExpenseStatus =
      action === "APPROVE" ? "APPROVED" : action === "PAY" ? "PAID" : "REJECTED";

    tx.update(ref, {
      status: nextStatus,
      decidedBy: actorId,
      decidedAt: nowTimestamp(),
    });

    // Ids are derived from the expense and the step, so each of APPROVE and PAY
    // owns exactly one entry: a replay overwrites its own rather than minting a
    // second one that double-counts.
    if (action === "APPROVE") {
      const { id: entryId, doc } = buildJournalEntry({
        date: expense.date,
        memo: `Expense: ${expense.vendor} — ${CATEGORY_NAME[expense.category]}`,
        reference: id,
        source: "EXPENSE",
        entryId: `EXPENSE_${id}_APPROVE`,
        createdBy: actorId,
        lines: [
          {
            accountCode: expense.accountCode,
            accountName: CATEGORY_NAME[expense.category],
            debit: expense.amount,
            credit: 0,
          },
          { accountCode: PAYABLE_CODE, accountName: PAYABLE_NAME, debit: 0, credit: expense.amount },
        ],
      });
      tx.set(journal.doc(entryId), doc);
    } else if (action === "PAY") {
      const { id: entryId, doc } = buildJournalEntry({
        date: expense.date,
        memo: `Payment: ${expense.vendor}`,
        reference: id,
        source: "EXPENSE",
        entryId: `EXPENSE_${id}_PAY`,
        createdBy: actorId,
        lines: [
          { accountCode: PAYABLE_CODE, accountName: PAYABLE_NAME, debit: expense.amount, credit: 0 },
          { accountCode: CASH_CODE, accountName: CASH_NAME, debit: 0, credit: expense.amount },
        ],
      });
      tx.set(journal.doc(entryId), doc);
    }

    return { ...expense, status: nextStatus, decidedBy: actorId };
  });
}

/** Approved + paid expense total, and count of drafts awaiting a decision. */
export async function expensesSummary(
  cid: string,
): Promise<{ count: number; pendingCount: number; approvedTotal: number }> {
  const all = await listExpenses(cid);
  return {
    count: all.length,
    pendingCount: all.filter((e) => e.status === "DRAFT").length,
    approvedTotal:
      Math.round(
        all
          .filter((e) => e.status === "APPROVED" || e.status === "PAID")
          .reduce((s, e) => s + e.amount, 0) * 100,
      ) / 100,
  };
}
