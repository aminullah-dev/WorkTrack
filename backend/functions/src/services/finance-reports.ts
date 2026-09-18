import { tenant } from "../lib/firestore";
import { listAccounts, type AccountType, type JournalLine } from "./accounting";
import { expensesSummary } from "./expenses";

/**
 * Finance overview report: ledger position (income/expense/net profit by
 * account type), an operational expenses/payroll summary, and a 6-month
 * income-vs-expense trend derived from journal entry dates.
 */

export interface MonthlyPoint {
  month: string; // ISO YYYY-MM (Gregorian, from entry date)
  income: number;
  expense: number;
  net: number;
}

export interface FinanceOverview {
  currency: string;
  ledger: {
    incomeTotal: number;
    expenseTotal: number;
    assetTotal: number;
    liabilityTotal: number;
    netProfit: number;
  };
  expenses: { count: number; pendingCount: number; approvedTotal: number };
  payroll: { runCount: number; netTotal: number };
  trend: MonthlyPoint[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function financeOverview(cid: string, currency: string): Promise<FinanceOverview> {
  const [accounts, journalSnap, payrollSnap, expSummary] = await Promise.all([
    listAccounts(cid),
    tenant(cid, "journalEntries").get(),
    tenant(cid, "payrollRuns").get(),
    expensesSummary(cid),
  ]);

  const typeByCode = new Map<string, AccountType>(accounts.map((a) => [a.code, a.type]));

  const byType: Record<AccountType, number> = {
    ASSET: 0,
    LIABILITY: 0,
    EQUITY: 0,
    INCOME: 0,
    EXPENSE: 0,
  };
  const months = new Map<string, { income: number; expense: number }>();

  for (const doc of journalSnap.docs) {
    const data = doc.data() as { date?: string; lines?: JournalLine[] };
    const month = (data.date ?? "").slice(0, 7); // YYYY-MM
    for (const l of data.lines ?? []) {
      const type = typeByCode.get(l.accountCode);
      if (!type) continue;
      const debit = l.debit || 0;
      const credit = l.credit || 0;
      // Signed balance in the account's normal direction.
      const signed =
        type === "ASSET" || type === "EXPENSE" ? debit - credit : credit - debit;
      byType[type] = round2(byType[type] + signed);

      if (month && (type === "INCOME" || type === "EXPENSE")) {
        const cur = months.get(month) ?? { income: 0, expense: 0 };
        if (type === "INCOME") cur.income += credit - debit;
        else cur.expense += debit - credit;
        months.set(month, cur);
      }
    }
  }

  const payrollNet = payrollSnap.docs.reduce(
    (s, d) => s + ((d.data().totalNet as number) ?? 0),
    0,
  );

  const trend: MonthlyPoint[] = [...months.entries()]
    .map(([month, v]) => ({
      month,
      income: round2(v.income),
      expense: round2(v.expense),
      net: round2(v.income - v.expense),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return {
    currency,
    ledger: {
      incomeTotal: round2(byType.INCOME),
      expenseTotal: round2(byType.EXPENSE),
      assetTotal: round2(byType.ASSET),
      liabilityTotal: round2(byType.LIABILITY),
      netProfit: round2(byType.INCOME - byType.EXPENSE),
    },
    expenses: expSummary,
    payroll: { runCount: payrollSnap.size, netTotal: round2(payrollNet) },
    trend,
  };
}
