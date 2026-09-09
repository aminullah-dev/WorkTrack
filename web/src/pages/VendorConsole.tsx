import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";
import { vendorApi } from "./vendor/api";
import { AccountDetail } from "./vendor/AccountDetail";
import { afn, STAGES, todayIso } from "./vendor/types";
import type { Account, CompanySummary, Dashboard, License } from "./vendor/types";

/**
 * Linumic's own console.
 *
 * Deliberately in English and outside the tenant portal's shell — this is not a
 * customer-facing screen and should never be mistaken for one. Two halves: the
 * customers who exist as live tenants and their licences, and the CRM of people
 * being sold to, who may not be tenants at all yet.
 */

type Tab = "today" | "pipeline" | "customers" | "money" | "support";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "pipeline", label: "Pipeline" },
  { id: "customers", label: "Customers" },
  { id: "money", label: "Money" },
  { id: "support", label: "Support" },
];

export function VendorConsole() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [companies, setCompanies] = useState<CompanySummary[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [board, setBoard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const [openAccount, setOpenAccount] = useState<Account | null>(null);
  const [licenceFor, setLicenceFor] = useState<CompanySummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function loadAll() {
    setError(false);
    try {
      const [c, a, d] = await Promise.all([
        vendorApi.companies(),
        vendorApi.accounts.list(),
        vendorApi.dashboard(),
      ]);
      setCompanies(c);
      setAccounts(a);
      setBoard(d);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  const expiringSoon = (companies ?? []).filter(
    (c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 30,
  ).length;
  const needsAttention =
    (board?.dueNow.length ?? 0) + expiringSoon + (board?.openTickets.length ?? 0);

  return (
    <div className="vendor" dir="ltr">
      <header className="vendor-head">
        <div>
          <h1>Linumic</h1>
          <p className="section-hint">
            {companies ? `${companies.length} live` : "…"}
            {accounts && ` · ${accounts.length} in the pipeline`}
            {needsAttention > 0 && ` · ${needsAttention} needing attention`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={() => void loadAll()}>
            Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="vendor-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`vendor-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <ErrorState message="Could not load" onRetry={() => void loadAll()} />
      ) : !companies || !accounts || !board ? (
        <LoadingState />
      ) : (
        <>
          {tab === "today" && (
            <Today board={board} companies={companies} accounts={accounts} onOpen={setOpenAccount} />
          )}
          {tab === "pipeline" && (
            <Pipeline
              accounts={accounts}
              onOpen={setOpenAccount}
              onAdded={async () => {
                await loadAll();
                flash("Added");
              }}
            />
          )}
          {tab === "customers" && (
            <Customers companies={companies} onLicence={setLicenceFor} />
          )}
          {tab === "money" && <Money board={board} accounts={accounts} onOpen={setOpenAccount} />}
          {tab === "support" && <Support board={board} accounts={accounts} onOpen={setOpenAccount} />}
        </>
      )}

      {openAccount && (
        <AccountDetail
          account={openAccount}
          onClose={() => setOpenAccount(null)}
          onChanged={async () => {
            await loadAll();
            flash("Saved");
          }}
          // Silent: an invoice being paid should update the totals behind the
          // dialog without a toast for every keystroke-sized change.
          onDataChanged={loadAll}
        />
      )}

      {licenceFor && (
        <LicenceEditor
          company={licenceFor}
          onClose={() => setLicenceFor(null)}
          onSaved={async () => {
            setLicenceFor(null);
            await loadAll();
            flash("Licence updated");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

/* ------------------------------------------------------------------- today */

function Today({
  board,
  companies,
  accounts,
  onOpen,
}: {
  board: Dashboard;
  companies: CompanySummary[];
  accounts: Account[];
  onOpen: (a: Account) => void;
}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const expiring = companies
    .filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 30)
    .sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));

  const nothing =
    board.dueNow.length === 0 &&
    board.dueSoon.length === 0 &&
    expiring.length === 0 &&
    board.unpaidInvoices.length === 0 &&
    board.openTickets.length === 0;

  if (nothing) {
    return <EmptyState message="Nothing needs you today." />;
  }

  return (
    <div className="vendor-cards">
      <Card title="Follow up now" count={board.dueNow.length} tone="negative">
        {board.dueNow.map((a) => (
          <Row key={a.id} onClick={() => onOpen(a)}>
            <strong>{a.name}</strong>
            <span className="muted">{a.nextAction ?? "—"}</span>
            <Chip tone="negative">{a.nextActionAt}</Chip>
          </Row>
        ))}
      </Card>

      <Card title="Licences expiring" count={expiring.length} tone="warning">
        {expiring.map((c) => (
          <Row key={c.companyId}>
            <strong>{c.name}</strong>
            <span className="muted">
              {c.devicesInUse}/{c.license.deviceLimit} seats
            </span>
            <Chip tone={(c.daysUntilExpiry ?? 0) < 0 ? "negative" : "warning"}>
              {(c.daysUntilExpiry ?? 0) < 0
                ? `expired ${-(c.daysUntilExpiry ?? 0)}d ago`
                : `${c.daysUntilExpiry}d left`}
            </Chip>
          </Row>
        ))}
      </Card>

      <Card title="This week" count={board.dueSoon.length} tone="neutral">
        {board.dueSoon.map((a) => (
          <Row key={a.id} onClick={() => onOpen(a)}>
            <strong>{a.name}</strong>
            <span className="muted">{a.nextAction ?? "—"}</span>
            <Chip tone="neutral">{a.nextActionAt}</Chip>
          </Row>
        ))}
      </Card>

      <Card
        title="Unpaid"
        count={board.unpaidInvoices.length}
        tone="warning"
        note={board.outstandingAfn > 0 ? afn(board.outstandingAfn) : undefined}
      >
        {board.unpaidInvoices.map((i) => {
          const a = byId.get(i.accountId);
          return (
            <Row key={i.id} onClick={a ? () => onOpen(a) : undefined}>
              <strong>{i.number}</strong>
              <span className="muted">{a?.name ?? i.accountId}</span>
              <span>{afn(i.amountAfn)}</span>
              {i.dueAt && <Chip tone={i.dueAt < todayIso() ? "negative" : "neutral"}>due {i.dueAt}</Chip>}
            </Row>
          );
        })}
      </Card>

      <Card title="Open issues" count={board.openTickets.length} tone="warning">
        {board.openTickets.map((t) => {
          const a = byId.get(t.accountId);
          return (
            <Row key={t.id} onClick={a ? () => onOpen(a) : undefined}>
              <Chip tone={t.priority === "URGENT" ? "negative" : "warning"}>{t.priority}</Chip>
              <strong>{t.subject}</strong>
              <span className="muted">{a?.name ?? t.accountId}</span>
            </Row>
          );
        })}
      </Card>
    </div>
  );
}

function Card({
  title,
  count,
  tone,
  note,
  children,
}: {
  title: string;
  count: number;
  tone: "negative" | "warning" | "neutral";
  note?: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="card vendor-card">
      <div className="vendor-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <Chip tone={tone}>{note ?? count}</Chip>
      </div>
      <ul className="vendor-list">{children}</ul>
    </section>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <li
      className={`vendor-list-row${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="vendor-list-main">{children}</div>
    </li>
  );
}

/* ---------------------------------------------------------------- pipeline */

function Pipeline({
  accounts,
  onOpen,
  onAdded,
}: {
  accounts: Account[];
  onOpen: (a: Account) => void;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");

  const shown = accounts.filter((a) => {
    const q = filter.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || (a.city ?? "").toLowerCase().includes(q);
  });

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="New prospect's name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={!name.trim()}
          onClick={async () => {
            await vendorApi.accounts.create({ name: name.trim(), stage: "LEAD" });
            setName("");
            await onAdded();
          }}
        >
          Add prospect
        </button>
        <input
          className="input"
          style={{ width: 200, marginInlineStart: "auto" }}
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState message="Nobody in the pipeline yet." />
      ) : (
        <div className="vendor-board">
          {STAGES.map((stage) => {
            const inStage = shown.filter((a) => a.stage === stage);
            return (
              <div key={stage} className="vendor-column">
                <h3>
                  {stage} <span className="muted">{inStage.length}</span>
                </h3>
                {inStage.map((a) => (
                  <button key={a.id} className="vendor-chip-card" onClick={() => onOpen(a)}>
                    <strong>{a.name}</strong>
                    {a.city && <span className="muted">{a.city}</span>}
                    {a.nextActionAt && (
                      <Chip tone={a.nextActionAt <= todayIso() ? "negative" : "neutral"}>
                        {a.nextActionAt}
                      </Chip>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- customers */

function Customers({
  companies,
  onLicence,
}: {
  companies: CompanySummary[];
  onLicence: (c: CompanySummary) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = companies.filter((c) => {
    const q = filter.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.companyId.toLowerCase().includes(q);
  });

  return (
    <>
      <input
        className="input"
        style={{ width: 240, marginBottom: 14 }}
        placeholder="Filter by name or id"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {shown.length === 0 ? (
        <EmptyState message="No live company matches that." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Seats</th>
                <th>People</th>
                <th>Enforced</th>
                <th>Expiry</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.companyId}>
                  <td>
                    <div>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {c.companyId}
                    </div>
                    {c.deletion && (
                      <Chip tone="negative">closing · purge {c.deletion.purgeAfter ?? "—"}</Chip>
                    )}
                  </td>
                  <td>{c.license.plan}</td>
                  <td>
                    <Chip tone={c.devicesInUse >= c.license.deviceLimit ? "warning" : "neutral"}>
                      {c.devicesInUse} / {c.license.deviceLimit}
                    </Chip>
                  </td>
                  <td>{c.employeeCount}</td>
                  <td>
                    <Chip tone={c.license.enforceDevices ? "positive" : "neutral"}>
                      {c.license.enforceDevices ? "yes" : "no"}
                    </Chip>
                  </td>
                  <td>
                    <Chip
                      tone={
                        c.daysUntilExpiry === null
                          ? "positive"
                          : c.daysUntilExpiry < 0
                            ? "negative"
                            : c.daysUntilExpiry <= 30
                              ? "warning"
                              : "positive"
                      }
                    >
                      {c.license.expiresAt === null
                        ? "No expiry"
                        : (c.daysUntilExpiry ?? 0) < 0
                          ? `Expired ${-(c.daysUntilExpiry ?? 0)}d ago`
                          : `${c.daysUntilExpiry}d left`}
                    </Chip>
                  </td>
                  <td style={{ textAlign: "end" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => onLicence(c)}>
                      Licence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- money */

function Money({
  board,
  accounts,
  onOpen,
}: {
  board: Dashboard;
  accounts: Account[];
  onOpen: (a: Account) => void;
}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return (
    <>
      <div className="vendor-stats">
        <Stat label="Outstanding" value={afn(board.outstandingAfn)} tone="warning" />
        <Stat label="Quotes out" value={afn(board.openPipelineAfn)} tone="neutral" />
        <Stat label="Unpaid invoices" value={String(board.unpaidInvoices.length)} tone="neutral" />
      </div>
      {board.unpaidInvoices.length === 0 ? (
        <EmptyState message="Nothing outstanding." />
      ) : (
        <ul className="vendor-list">
          {board.unpaidInvoices.map((i) => {
            const a = byId.get(i.accountId);
            return (
              <Row key={i.id} onClick={a ? () => onOpen(a) : undefined}>
                <strong>{i.number}</strong>
                <span className="muted">{a?.name ?? i.accountId}</span>
                <span>{afn(i.amountAfn)}</span>
                <span className="muted">issued {i.issuedAt}</span>
                {i.dueAt && (
                  <Chip tone={i.dueAt < todayIso() ? "negative" : "neutral"}>due {i.dueAt}</Chip>
                )}
              </Row>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "warning" | "neutral" }) {
  return (
    <div className="card vendor-stat">
      <span className="label">{label}</span>
      <strong className={tone === "warning" ? "vendor-stat-warn" : ""}>{value}</strong>
    </div>
  );
}

/* ------------------------------------------------------------------ support */

function Support({
  board,
  accounts,
  onOpen,
}: {
  board: Dashboard;
  accounts: Account[];
  onOpen: (a: Account) => void;
}) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (board.openTickets.length === 0) {
    return <EmptyState message="No open issues." />;
  }
  return (
    <ul className="vendor-list">
      {board.openTickets.map((t) => {
        const a = byId.get(t.accountId);
        return (
          <Row key={t.id} onClick={a ? () => onOpen(a) : undefined}>
            <Chip tone={t.priority === "URGENT" ? "negative" : "warning"}>{t.priority}</Chip>
            <Chip tone="neutral">{t.status}</Chip>
            <strong>{t.subject}</strong>
            <span className="muted">
              {a?.name ?? t.accountId} · opened {t.openedAt}
            </span>
          </Row>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ licence */

const PLANS: License["plan"][] = ["FREE", "STANDARD", "ENTERPRISE"];
const STATUSES: License["status"][] = ["ACTIVE", "SUSPENDED", "EXPIRED"];

function LicenceEditor({
  company,
  onClose,
  onSaved,
}: {
  company: CompanySummary;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<License>({ ...company.license });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!Number.isInteger(form.deviceLimit) || form.deviceLimit < 1) {
      return setError("Seats must be a whole number of 1 or more.");
    }
    setBusy(true);
    try {
      await vendorApi.setLicense(company.companyId, {
        ...form,
        expiresAt: form.expiresAt || null,
      });
      await onSaved();
    } catch {
      setError("Could not save. The change was not applied.");
    } finally {
      setBusy(false);
    }
  }

  const shrinking = form.deviceLimit < company.devicesInUse;

  return (
    <div className="vendor-overlay" onClick={onClose}>
      <div className="vendor-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{company.name}</h2>
        <p className="muted" style={{ marginTop: -6, fontSize: 12 }}>
          {company.companyId}
        </p>

        <div className="form-row">
          <label className="field" style={{ minWidth: 140 }}>
            <span className="label">Plan</span>
            <select
              className="select"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as License["plan"] })}
            >
              {PLANS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 120 }}>
            <span className="label">Device seats</span>
            <input
              className="input"
              type="number"
              min={1}
              value={form.deviceLimit}
              onChange={(e) => setForm({ ...form, deviceLimit: Number(e.target.value) })}
            />
            <span className="hint">{company.devicesInUse} in use</span>
          </label>
          <label className="field" style={{ minWidth: 140 }}>
            <span className="label">Status</span>
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as License["status"] })}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 160 }}>
            <span className="label">Expires</span>
            <input
              className="input"
              type="date"
              value={form.expiresAt ?? ""}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
            />
            <span className="hint">Empty = never</span>
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <input
            type="checkbox"
            checked={form.enforceDevices}
            onChange={(e) => setForm({ ...form, enforceDevices: e.target.checked })}
          />
          <span>
            Enforce the seat limit
            <span className="hint" style={{ display: "block" }}>
              While this is off the limit is contractual only — no device is ever refused.
            </span>
          </span>
        </label>

        {shrinking && (
          <p className="notice-warning" style={{ marginTop: 12 }}>
            {company.devicesInUse} devices are registered but this grants {form.deviceLimit}.
            Registered devices keep working; the next new one is refused.
          </p>
        )}

        {error && <p className="form-error">{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save licence"}
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
