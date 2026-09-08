import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

/**
 * Linumic's own console: every customer, their licence, and what is about to
 * expire.
 *
 * Deliberately in English and outside the tenant portal's shell — this is not a
 * customer-facing screen and should never be mistaken for one. It shows
 * company-level facts only; there is no route here to anybody's staff, and the
 * server would refuse one.
 */

interface License {
  plan: "FREE" | "STANDARD" | "ENTERPRISE";
  deviceLimit: number;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt: string | null;
  enforceDevices: boolean;
}

interface CompanySummary {
  companyId: string;
  name: string;
  status: string;
  license: License;
  devicesInUse: number;
  employeeCount: number;
  daysUntilExpiry: number | null;
  deletion: { status: string; purgeAfter: string | null } | null;
}

const PLANS: License["plan"][] = ["FREE", "STANDARD", "ENTERPRISE"];
const STATUSES: License["status"][] = ["ACTIVE", "SUSPENDED", "EXPIRED"];

function expiryTone(days: number | null): "positive" | "warning" | "negative" {
  if (days === null) return "positive";
  if (days < 0) return "negative";
  if (days <= 30) return "warning";
  return "positive";
}

function expiryLabel(c: CompanySummary): string {
  if (!c.license.expiresAt) return "No expiry";
  const d = c.daysUntilExpiry;
  if (d === null) return c.license.expiresAt;
  if (d < 0) return `Expired ${-d}d ago`;
  if (d === 0) return "Expires today";
  return `${d}d left`;
}

export function VendorConsole() {
  const { signOut } = useAuth();
  const [rows, setRows] = useState<CompanySummary[] | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<CompanySummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function load() {
    setError(false);
    try {
      const { data } = await api.get<CompanySummary[]>("/vendor/companies");
      setRows(data);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  const shown = (rows ?? []).filter((c) => {
    const q = filter.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.companyId.toLowerCase().includes(q);
  });

  const expiringSoon = (rows ?? []).filter(
    (c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= 30,
  ).length;

  return (
    <div className="vendor" dir="ltr">
      <header className="vendor-head">
        <div>
          <h1>Linumic — customers</h1>
          <p className="section-hint">
            {rows ? `${rows.length} companies` : "…"}
            {expiringSoon > 0 && ` · ${expiringSoon} expiring within 30 days`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="Filter by name or id"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-outline btn-sm" onClick={() => void load()}>
            Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {error ? (
        <ErrorState message="Could not load customers" onRetry={() => void load()} />
      ) : !rows ? (
        <LoadingState />
      ) : shown.length === 0 ? (
        <EmptyState message={filter ? "No company matches that." : "No companies yet."} />
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
              {shown.map((c) => {
                const full = c.devicesInUse >= c.license.deviceLimit;
                return (
                  <tr key={c.companyId}>
                    <td>
                      <div>{c.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {c.companyId}
                      </div>
                      {c.deletion && (
                        <Chip tone="negative">
                          closing · purge {c.deletion.purgeAfter ?? "—"}
                        </Chip>
                      )}
                    </td>
                    <td>{c.license.plan}</td>
                    <td>
                      <Chip tone={full ? "warning" : "neutral"}>
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
                      <Chip tone={expiryTone(c.daysUntilExpiry)}>{expiryLabel(c)}</Chip>
                    </td>
                    <td style={{ textAlign: "end" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(c)}>
                        Licence
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <LicenceEditor
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            flash("Licence updated");
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

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
    if (form.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiresAt)) {
      return setError("Expiry must be YYYY-MM-DD, or empty for none.");
    }
    setBusy(true);
    try {
      await api.put(`/vendor/companies/${company.companyId}/license`, {
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
          <div className="field" style={{ minWidth: 140 }}>
            <label className="label" htmlFor="v-plan">
              Plan
            </label>
            <select
              id="v-plan"
              className="select"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as License["plan"] })}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 120 }}>
            <label className="label" htmlFor="v-seats">
              Device seats
            </label>
            <input
              id="v-seats"
              className="input"
              type="number"
              min={1}
              value={form.deviceLimit}
              onChange={(e) => setForm({ ...form, deviceLimit: Number(e.target.value) })}
            />
            <span className="hint">{company.devicesInUse} in use</span>
          </div>

          <div className="field" style={{ minWidth: 140 }}>
            <label className="label" htmlFor="v-status">
              Status
            </label>
            <select
              id="v-status"
              className="select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as License["status"] })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 160 }}>
            <label className="label" htmlFor="v-expires">
              Expires
            </label>
            <input
              id="v-expires"
              className="input"
              type="date"
              value={form.expiresAt ?? ""}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value || null })}
            />
            <span className="hint">Empty = never</span>
          </div>
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
            {company.devicesInUse} devices are registered but this grants{" "}
            {form.deviceLimit}. Registered devices keep working; the next new one is
            refused.
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
