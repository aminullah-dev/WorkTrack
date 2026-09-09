import { useState } from "react";
import {
  useAccounts,
  useCreateExpense,
  useCreateJournalEntry,
  useDecideExpense,
  useExpenses,
  useFinanceOverview,
  useJournal,
  useTrialBalance,
} from "../api/hooks";
import type { Expense, ExpenseCategory } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

type Tab = "overview" | "expenses" | "ledger";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "rent",
  "utilities",
  "supplies",
  "travel",
  "services",
  "other",
];

export function FinancePage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("fin_tab_overview") },
    { key: "expenses", label: t("fin_tab_expenses") },
    { key: "ledger", label: t("fin_tab_ledger") },
  ];

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("fin_title")}</h1>
        <div className="lang-switch" role="tablist">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              className={tb.key === tab ? "active" : ""}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "expenses" && <ExpensesTab />}
      {tab === "ledger" && <LedgerTab />}
    </>
  );
}

// ------------------------------------------------------------------- overview

function OverviewTab() {
  const { t, num, locale } = useI18n();
  const overview = useFinanceOverview();

  if (overview.isLoading) return <LoadingState />;
  if (overview.isError)
    return <ErrorState message={t("common_error")} onRetry={() => void overview.refetch()} />;
  const o = overview.data!;
  const cur = o.currency;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label={t("fin_net_profit")} value={money(o.ledger.netProfit, cur, num)} accent={o.ledger.netProfit >= 0 ? undefined : "red"} />
        <Kpi label={t("fin_income")} value={money(o.ledger.incomeTotal, cur, num)} />
        <Kpi label={t("fin_expense")} value={money(o.ledger.expenseTotal, cur, num)} accent="orange" />
        <Kpi label={t("fin_payroll_cost")} value={money(o.payroll.netTotal, cur, num)} />
        <Kpi label={t("fin_expenses_approved")} value={money(o.expenses.approvedTotal, cur, num)} />
        <Kpi label={t("fin_expenses_pending")} value={locale === "en" ? String(o.expenses.pendingCount) : num(o.expenses.pendingCount)} accent={o.expenses.pendingCount > 0 ? "amber" : undefined} />
      </div>

      <div className="settings-grid">
        <div className="card">
          <h2 className="card-title">{t("fin_position")}</h2>
          <PositionRow label={t("fin_assets")} value={money(o.ledger.assetTotal, cur, num)} />
          <PositionRow label={t("fin_liabilities")} value={money(o.ledger.liabilityTotal, cur, num)} />
          <PositionRow label={t("fin_income")} value={money(o.ledger.incomeTotal, cur, num)} />
          <PositionRow label={t("fin_expense")} value={money(o.ledger.expenseTotal, cur, num)} />
          <PositionRow label={t("fin_net_profit")} value={money(o.ledger.netProfit, cur, num)} strong />
        </div>

        <div className="card">
          <h2 className="card-title">{t("fin_trend")}</h2>
          {o.trend.length === 0 ? (
            <EmptyState message={t("fin_no_trend")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("fin_month")}</th>
                  <th>{t("fin_income")}</th>
                  <th>{t("fin_expense")}</th>
                  <th>{t("fin_net")}</th>
                </tr>
              </thead>
              <tbody>
                {o.trend.map((p) => (
                  <tr key={p.month}>
                    <td>{p.month}</td>
                    <td>{money(p.income, cur, num)}</td>
                    <td>{money(p.expense, cur, num)}</td>
                    <td style={{ fontWeight: 600, color: p.net >= 0 ? "var(--green)" : "var(--red)" }}>
                      {money(p.net, cur, num)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "red" | "amber" | "orange" }) {
  return (
    <div className={`kpi${accent ? ` accent-${accent}` : ""}`}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function PositionRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="switch-row">
      <span style={{ fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ------------------------------------------------------------------- expenses

function ExpensesTab() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const expenses = useExpenses();
  const decide = useDecideExpense();
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function onDecide(id: string, action: "APPROVE" | "REJECT" | "PAY") {
    try {
      await decide.mutateAsync({ id, action });
      flash(t("fin_expense_updated"));
    } catch {
      flash(t("common_error"));
    }
  }

  return (
    <>
      {can("expenses:write") && (
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + {t("fin_add_expense")}
          </button>
        </div>
      )}

      {expenses.isLoading ? (
        <LoadingState />
      ) : expenses.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void expenses.refetch()} />
      ) : (expenses.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("fin_expenses_empty")} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("fin_date")}</th>
                <th>{t("fin_vendor")}</th>
                <th>{t("fin_category")}</th>
                <th>{t("fin_amount")}</th>
                <th>{t("fin_status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.data!.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{e.vendor}</td>
                  <td>{t(`fin_cat_${e.category}`)}</td>
                  <td style={{ fontWeight: 600 }}>{money(e.amount, e.currency, num)}</td>
                  <td><ExpenseStatusChip status={e.status} /></td>
                  <td>
                    <ExpenseActions expense={e} can={can("expenses:approve")} onDecide={onDecide} busy={decide.isPending} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddExpenseModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); flash(t("fin_expense_added")); }} />}
      {toast && <Toast message={toast} />}
    </>
  );
}

function ExpenseActions({
  expense,
  can,
  onDecide,
  busy,
}: {
  expense: Expense;
  can: boolean;
  onDecide: (id: string, action: "APPROVE" | "REJECT" | "PAY") => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  if (!can) return null;
  return (
    <div className="row-actions">
      {expense.status === "DRAFT" && (
        <>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onDecide(expense.id, "APPROVE")}>
            {t("fin_approve")}
          </button>
          <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDecide(expense.id, "REJECT")}>
            {t("fin_reject")}
          </button>
        </>
      )}
      {expense.status === "APPROVED" && (
        <button className="btn btn-accent btn-sm" disabled={busy} onClick={() => onDecide(expense.id, "PAY")}>
          {t("fin_mark_paid")}
        </button>
      )}
    </div>
  );
}

function ExpenseStatusChip({ status }: { status: Expense["status"] }) {
  const { t } = useI18n();
  const map = {
    DRAFT: "warning",
    APPROVED: "positive",
    PAID: "neutral",
    REJECTED: "negative",
  } as const;
  return <Chip tone={map[status]}>{t(`fin_status_${status.toLowerCase()}`)}</Chip>;
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const create = useCreateExpense();
  const [category, setCategory] = useState<ExpenseCategory>("rent");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!vendor.trim() || !(value > 0)) {
      setError(t("fin_form_invalid"));
      return;
    }
    try {
      await create.mutateAsync({ category, vendor: vendor.trim(), amount: value, date, description });
      onSaved();
    } catch {
      setError(t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{t("fin_add_expense")}</h2>
        <div className="field">
          <label>{t("fin_vendor")}</label>
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>{t("fin_category")}</label>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`fin_cat_${c}`)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("fin_amount")}</label>
            <input className="input" type="number" min="0" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>{t("fin_date")}</label>
          <input className="input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t("fin_description")}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <div className="field-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t("common_cancel")}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={create.isPending}>
            {create.isPending ? t("common_saving") : t("common_save")}
          </button>
        </div>
      </form>
    </div>
  );
}

// --------------------------------------------------------------------- ledger

function LedgerTab() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const trial = useTrialBalance();
  const journal = useJournal();
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      {can("ledger:write") && (
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + {t("fin_add_journal")}
          </button>
        </div>
      )}

      <div className="settings-grid">
        <div className="card">
          <h2 className="card-title">{t("fin_trial_balance")}</h2>
          {trial.isLoading ? (
            <LoadingState />
          ) : trial.isError ? (
            <ErrorState message={t("common_error")} onRetry={() => void trial.refetch()} />
          ) : (trial.data?.rows.length ?? 0) === 0 ? (
            <EmptyState message={t("fin_ledger_empty")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("fin_account")}</th>
                  <th>{t("fin_debit")}</th>
                  <th>{t("fin_credit")}</th>
                </tr>
              </thead>
              <tbody>
                {trial.data!.rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code} · {r.name}</td>
                    <td>{r.debit ? num(fmt(r.debit)) : "—"}</td>
                    <td>{r.credit ? num(fmt(r.credit)) : "—"}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700 }}>{t("fin_total")}</td>
                  <td style={{ fontWeight: 700 }}>{num(fmt(trial.data!.totalDebit))}</td>
                  <td style={{ fontWeight: 700 }}>{num(fmt(trial.data!.totalCredit))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">{t("fin_journal")}</h2>
          {journal.isLoading ? (
            <LoadingState />
          ) : journal.isError ? (
            <ErrorState message={t("common_error")} onRetry={() => void journal.refetch()} />
          ) : (journal.data?.length ?? 0) === 0 ? (
            <EmptyState message={t("fin_journal_empty")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("fin_date")}</th>
                  <th>{t("fin_memo")}</th>
                  <th>{t("fin_amount")}</th>
                </tr>
              </thead>
              <tbody>
                {journal.data!.map((j) => (
                  <tr key={j.id}>
                    <td>{j.date}</td>
                    <td>{j.memo}</td>
                    <td style={{ fontWeight: 600 }}>{num(fmt(j.totalDebit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {adding && <AddJournalModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setToast(t("fin_journal_added")); window.setTimeout(() => setToast(null), 2400); }} />}
      {toast && <Toast message={toast} />}
    </>
  );
}

function AddJournalModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const create = useCreateJournalEntry();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [debitCode, setDebitCode] = useState("");
  const [creditCode, setCreditCode] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const opts = accounts.data ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!memo.trim() || !debitCode || !creditCode || debitCode === creditCode || !(value > 0)) {
      setError(t("fin_journal_invalid"));
      return;
    }
    try {
      await create.mutateAsync({
        date,
        memo: memo.trim(),
        lines: [
          { accountCode: debitCode, accountName: "", debit: value, credit: 0 },
          { accountCode: creditCode, accountName: "", debit: 0, credit: value },
        ],
      });
      onSaved();
    } catch {
      setError(t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{t("fin_add_journal")}</h2>
        <div className="field">
          <label>{t("fin_memo")}</label>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>{t("fin_debit_account")}</label>
            <select className="select" value={debitCode} onChange={(e) => setDebitCode(e.target.value)}>
              <option value="">—</option>
              {opts.map((a) => (
                <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("fin_credit_account")}</label>
            <select className="select" value={creditCode} onChange={(e) => setCreditCode(e.target.value)}>
              <option value="">—</option>
              {opts.map((a) => (
                <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>{t("fin_amount")}</label>
            <input className="input" type="number" min="0" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>{t("fin_date")}</label>
            <input className="input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        {error && <div className="field-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t("common_cancel")}</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={create.isPending}>
            {create.isPending ? t("common_saving") : t("common_save")}
          </button>
        </div>
      </form>
    </div>
  );
}

// --------------------------------------------------------------------- helpers

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function money(n: number, currency: string, num: (v: string | number) => string): string {
  return `${num(fmt(n))} ${currency}`;
}
