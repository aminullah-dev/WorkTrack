import { ApiError } from "../lib/errors";
import { nowTimestamp, tenant } from "../lib/firestore";
import { ulid } from "../lib/ids";

/**
 * Lightweight double-entry accounting for the finance module.
 *
 * - `accounts`        : the company's chart of accounts (code + type).
 * - `journalEntries`  : balanced debit/credit entries; the ledger of record.
 *
 * A trial balance is derived by summing journal lines per account. Normal
 * balances follow accounting convention: ASSET/EXPENSE are debit-normal,
 * LIABILITY/EQUITY/INCOME are credit-normal.
 */

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export const ACCOUNT_TYPES: AccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
];

/** Debit-normal account types; the rest are credit-normal. */
const DEBIT_NORMAL: ReadonlySet<AccountType> = new Set(["ASSET", "EXPENSE"]);

export interface AccountDto {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  active: boolean;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntryDto {
  id: string;
  date: string;
  memo: string;
  reference: string | null;
  source: "MANUAL" | "EXPENSE" | "PAYROLL";
  lines: JournalLine[];
  totalDebit: number;
  createdBy: string;
  createdAt: string | null;
}

/** Starter chart of accounts seeded on first read (Afghan SME defaults, AFN). */
export const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1010", name: "Bank", type: "ASSET" },
  { code: "1200", name: "Accounts Receivable", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Salaries Payable", type: "LIABILITY" },
  { code: "2200", name: "Taxes Payable", type: "LIABILITY" },
  { code: "2300", name: "Employee Withholdings", type: "LIABILITY" },
  { code: "2400", name: "Employer Contributions Payable", type: "LIABILITY" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" },
  { code: "4000", name: "Service Revenue", type: "INCOME" },
  { code: "4100", name: "Other Income", type: "INCOME" },
  { code: "5000", name: "Salaries & Wages", type: "EXPENSE" },
  { code: "5100", name: "Rent", type: "EXPENSE" },
  { code: "5200", name: "Utilities", type: "EXPENSE" },
  { code: "5300", name: "Office Supplies", type: "EXPENSE" },
  { code: "5400", name: "Travel & Transport", type: "EXPENSE" },
  { code: "5900", name: "Other Expenses", type: "EXPENSE" },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Reads the chart of accounts, seeding the defaults on first access. */
export async function listAccounts(cid: string): Promise<AccountDto[]> {
  const col = tenant(cid, "accounts");
  let snap = await col.get();
  if (snap.empty) {
    const batch = col.firestore.batch();
    for (const a of DEFAULT_ACCOUNTS) {
      batch.set(col.doc(a.code), { ...a, active: true, createdAt: nowTimestamp() });
    }
    await batch.commit();
    snap = await col.get();
  }
  return snap.docs
    .map((d) => {
      const v = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        code: (v.code as string) ?? d.id,
        name: (v.name as string) ?? "",
        type: (v.type as AccountType) ?? "EXPENSE",
        active: (v.active as boolean) ?? true,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function createAccount(
  cid: string,
  input: { code: string; name: string; type: AccountType },
): Promise<AccountDto> {
  const col = tenant(cid, "accounts");
  const existing = await col.doc(input.code).get();
  if (existing.exists) {
    throw new ApiError(409, "CONFLICT", `Account ${input.code} already exists`);
  }
  await col.doc(input.code).set({ ...input, active: true, createdAt: nowTimestamp() });
  return { id: input.code, ...input, active: true };
}

/**
 * Makes sure the given default accounts exist before something posts to them.
 *
 * The chart is seeded only when it is empty, so a company created before an
 * account code was added would never get it — and a journal line posted to a
 * code that is not in the chart is dropped from the trial balance entirely
 * (see computeTrialBalance), silently unbalancing the books. Call this before
 * posting to any account the caller did not read from listAccounts.
 */
export async function ensureAccounts(cid: string, codes: string[]): Promise<void> {
  const col = tenant(cid, "accounts");
  const missing = (
    await Promise.all(
      codes.map(async (code) => ((await col.doc(code).get()).exists ? null : code)),
    )
  ).filter((code): code is string => code !== null);
  if (!missing.length) return;

  const batch = col.firestore.batch();
  for (const code of missing) {
    const a = DEFAULT_ACCOUNTS.find((d) => d.code === code);
    if (!a) continue;
    batch.set(col.doc(a.code), { ...a, active: true, createdAt: nowTimestamp() });
  }
  await batch.commit();
}

/**
 * Posts a balanced journal entry. Throws 422 if debits ≠ credits or the entry
 * has fewer than two lines. Returns the created entry id.
 */
export interface JournalEntryInput {
  date: string;
  memo: string;
  reference?: string | null;
  source: JournalEntryDto["source"];
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
  createdBy: string;
  /**
   * Deterministic document id. Supplying one derived from the thing being
   * posted (an expense id, a payroll run id) makes the write idempotent: a
   * retry overwrites the same document instead of minting a second entry that
   * double-counts in the ledger. Omit it for genuinely one-off manual entries.
   */
  entryId?: string;
}

/**
 * Validates an entry and returns the document to write, without touching
 * Firestore. Split out from postJournalEntry so a caller can write the entry
 * inside its own transaction and keep the ledger in step with the state change
 * that caused it.
 */
export function buildJournalEntry(
  entry: JournalEntryInput,
): { id: string; doc: Record<string, unknown> } {
  if (entry.lines.length < 2) {
    throw ApiError.validation("A journal entry needs at least two lines");
  }
  const totalDebit = round2(entry.lines.reduce((s, l) => s + (l.debit || 0), 0));
  const totalCredit = round2(entry.lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (totalDebit !== totalCredit) {
    throw ApiError.validation(
      `Journal entry is unbalanced: debits ${totalDebit} ≠ credits ${totalCredit}`,
    );
  }
  if (totalDebit === 0) {
    throw ApiError.validation("Journal entry total cannot be zero");
  }

  return {
    id: entry.entryId ?? ulid(),
    doc: {
      date: entry.date,
      memo: entry.memo,
      reference: entry.reference ?? null,
      source: entry.source,
      lines: entry.lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: round2(l.debit || 0),
        credit: round2(l.credit || 0),
      })),
      totalDebit,
      createdBy: entry.createdBy,
      createdAt: nowTimestamp(),
    },
  };
}

export async function postJournalEntry(cid: string, entry: JournalEntryInput): Promise<string> {
  const { id, doc } = buildJournalEntry(entry);
  await tenant(cid, "journalEntries").doc(id).set(doc);
  return id;
}

export async function listJournalEntries(cid: string, limit = 100): Promise<JournalEntryDto[]> {
  const snap = await tenant(cid, "journalEntries").get();
  return snap.docs
    .map((d) => {
      const v = d.data() as Record<string, unknown>;
      const createdAt = v.createdAt as { toDate?: () => Date } | undefined;
      return {
        id: d.id,
        date: (v.date as string) ?? "",
        memo: (v.memo as string) ?? "",
        reference: (v.reference as string | null) ?? null,
        source: (v.source as JournalEntryDto["source"]) ?? "MANUAL",
        lines: (v.lines as JournalLine[]) ?? [],
        totalDebit: (v.totalDebit as number) ?? 0,
        createdBy: (v.createdBy as string) ?? "",
        createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  byType: Record<AccountType, number>;
  netProfit: number;
}

/** Aggregates all journal lines into a per-account trial balance. */
export async function computeTrialBalance(cid: string): Promise<TrialBalance> {
  const [accounts, snap] = await Promise.all([
    listAccounts(cid),
    tenant(cid, "journalEntries").get(),
  ]);

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const doc of snap.docs) {
    const lines = (doc.data().lines as JournalLine[] | undefined) ?? [];
    for (const l of lines) {
      const cur = totals.get(l.accountCode) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit || 0;
      cur.credit += l.credit || 0;
      totals.set(l.accountCode, cur);
    }
  }

  const byType: Record<AccountType, number> = {
    ASSET: 0,
    LIABILITY: 0,
    EQUITY: 0,
    INCOME: 0,
    EXPENSE: 0,
  };
  let totalDebit = 0;
  let totalCredit = 0;

  // A line posted to a code that is not in the chart would otherwise vanish
  // here, leaving totalDebit ≠ totalCredit with nothing to show why. Surface
  // those codes as their own rows instead of dropping them.
  const charted = new Set(accounts.map((a) => a.code));
  const orphans: AccountDto[] = [...totals.keys()]
    .filter((code) => !charted.has(code))
    .sort()
    .map((code) => ({
      id: code,
      code,
      name: `Unknown account ${code}`,
      type: "EXPENSE" as AccountType,
      active: false,
    }));

  const rows: TrialBalanceRow[] = [...accounts, ...orphans]
    .map((a) => {
      const t = totals.get(a.code) ?? { debit: 0, credit: 0 };
      const debit = round2(t.debit);
      const credit = round2(t.credit);
      // Signed balance in the account's normal direction.
      const balance = DEBIT_NORMAL.has(a.type)
        ? round2(debit - credit)
        : round2(credit - debit);
      byType[a.type] = round2(byType[a.type] + balance);
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      return { code: a.code, name: a.name, type: a.type, debit, credit, balance };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);

  return {
    rows,
    totalDebit,
    totalCredit,
    byType,
    netProfit: round2(byType.INCOME - byType.EXPENSE),
  };
}
