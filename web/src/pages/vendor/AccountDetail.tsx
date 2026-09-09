import { useEffect, useState } from "react";
import { vendorApi } from "./api";
import { afn, ACTIVITY_KINDS, STAGES, todayIso } from "./types";
import type { Account, Activity, Contact, Deal, Invoice, Ticket } from "./types";
import { Chip, LoadingState } from "../../ui/components";

/**
 * One account: who they are, everything said to them, and everything owed.
 *
 * The timeline is the point. A CRM earns its keep when you can open a customer
 * before a call and see what was last agreed, not when it stores fields.
 */
export function AccountDetail({
  account,
  onClose,
  onChanged,
  onDataChanged,
}: {
  account: Account;
  onClose: () => void;
  /** The account record itself was saved — the parent may say so. */
  onChanged: () => void | Promise<void>;
  /**
   * A child record changed: an invoice paid, a ticket resolved, a note added.
   * The parent's dashboard is computed from these, so it has to reload — the
   * "Unpaid" list otherwise keeps showing money already collected until
   * somebody happens to press Refresh.
   */
  onDataChanged: () => void | Promise<void>;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [form, setForm] = useState<Account>({ ...account });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(notifyParent = false) {
    const [c, a, d, i, t] = await Promise.all([
      vendorApi.contacts.list(account.id),
      vendorApi.activities.list(account.id),
      vendorApi.deals.list(account.id),
      vendorApi.invoices.list(account.id),
      vendorApi.tickets.list(account.id),
    ]);
    setContacts(c);
    setActivities(a.sort((x, y) => y.at.localeCompare(x.at)));
    setDeals(d);
    setInvoices(i.sort((x, y) => y.issuedAt.localeCompare(x.issuedAt)));
    setTickets(t.sort((x, y) => y.openedAt.localeCompare(x.openedAt)));
    if (notifyParent) await onDataChanged();
  }

  /** What every add, delete, "mark paid" and "resolve" calls. */
  const reload = () => loadAll(true);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  async function saveAccount() {
    setBusy(true);
    setError(null);
    try {
      await vendorApi.accounts.update(account.id, {
        name: form.name,
        stage: form.stage,
        companyId: form.companyId || null,
        city: form.city || null,
        industry: form.industry || null,
        source: form.source || null,
        employeesEstimate: form.employeesEstimate ?? null,
        nextActionAt: form.nextActionAt || null,
        nextAction: form.nextAction || null,
        notes: form.notes || null,
      });
      await onChanged();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const owed = (invoices ?? [])
    .filter((i) => i.status === "SENT")
    .reduce((s, i) => s + i.amountAfn, 0);

  return (
    <div className="vendor-overlay" onClick={onClose}>
      <div className="vendor-dialog vendor-dialog-wide" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-head" style={{ marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{account.name}</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
              {account.companyId ? `linked to ${account.companyId}` : "not a customer yet"}
              {owed > 0 && ` · ${afn(owed)} outstanding`}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {/* ------------------------------------------------------ the record */}
        <section className="vendor-section">
          <h3>Record</h3>
          <div className="form-row">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Stage">
              <select
                className="select"
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as Account["stage"] })}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Linked company id">
              <input
                className="input"
                placeholder="empty until they buy"
                value={form.companyId ?? ""}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="City">
              <input
                className="input"
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="Industry">
              <input
                className="input"
                value={form.industry ?? ""}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </Field>
            <Field label="Source">
              <input
                className="input"
                placeholder="referral, demo, visit"
                value={form.source ?? ""}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </Field>
            <Field label="Staff (their estimate)">
              <input
                className="input"
                type="number"
                min={0}
                value={form.employeesEstimate ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    employeesEstimate: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Next action">
              <input
                className="input"
                placeholder="Call about renewal"
                value={form.nextAction ?? ""}
                onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              />
            </Field>
            <Field label="…on">
              <input
                className="input"
                type="date"
                value={form.nextActionAt ?? ""}
                onChange={(e) => setForm({ ...form, nextActionAt: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className="input"
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" disabled={busy} onClick={() => void saveAccount()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </section>

        <Children
          title="Contacts"
          rows={contacts}
          empty="Nobody recorded yet."
          render={(c: Contact) => (
            <>
              <strong>{c.name}</strong>
              {c.primary && <Chip tone="positive">primary</Chip>}
              <span className="muted">
                {[c.role, c.phone, c.email].filter(Boolean).join(" · ")}
              </span>
            </>
          )}
          onDelete={(id) => vendorApi.contacts.remove(id)}
          reload={reload}
          form={<ContactForm accountId={account.id} onDone={reload} />}
        />

        <Children
          title="Timeline"
          rows={activities}
          empty="Nothing said yet."
          render={(a: Activity) => (
            <>
              <span className="muted" style={{ minWidth: 88 }}>
                {a.at}
              </span>
              <Chip tone="neutral">{a.kind}</Chip>
              <span>{a.summary}</span>
            </>
          )}
          onDelete={(id) => vendorApi.activities.remove(id)}
          reload={reload}
          form={<ActivityForm accountId={account.id} onDone={reload} />}
        />

        <Children
          title="Quotes"
          rows={deals}
          empty="No quote yet."
          render={(d: Deal) => (
            <>
              <Chip tone={d.status === "ACCEPTED" ? "positive" : d.status === "REJECTED" ? "negative" : "neutral"}>
                {d.status}
              </Chip>
              <strong>{afn(d.amountAfn)}</strong>
              <span className="muted">
                {d.plan} · {d.seats} seats · {d.term}
              </span>
            </>
          )}
          onDelete={(id) => vendorApi.deals.remove(id)}
          reload={reload}
          form={<DealForm accountId={account.id} onDone={reload} />}
        />

        <Children
          title="Invoices"
          rows={invoices}
          empty="Nothing invoiced."
          render={(i: Invoice) => (
            <>
              <Chip tone={i.status === "PAID" ? "positive" : i.status === "SENT" ? "warning" : "neutral"}>
                {i.status}
              </Chip>
              <strong>{i.number}</strong>
              <span>{afn(i.amountAfn)}</span>
              <span className="muted">
                issued {i.issuedAt}
                {i.dueAt && ` · due ${i.dueAt}`}
                {i.paidAt && ` · paid ${i.paidAt}${i.method ? ` (${i.method})` : ""}`}
              </span>
            </>
          )}
          onDelete={(id) => vendorApi.invoices.remove(id)}
          reload={reload}
          form={<InvoiceForm accountId={account.id} onDone={reload} />}
          extra={(i: Invoice) =>
            i.status === "SENT" ? (
              <button
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  await vendorApi.invoices.update(i.id, {
                    ...i,
                    status: "PAID",
                    paidAt: todayIso(),
                    method: i.method ?? "BANK",
                  });
                  await reload();
                }}
              >
                Mark paid
              </button>
            ) : null
          }
        />

        <Children
          title="Support"
          rows={tickets}
          empty="No issues raised."
          render={(t: Ticket) => (
            <>
              <Chip tone={t.status === "RESOLVED" ? "positive" : t.priority === "URGENT" ? "negative" : "warning"}>
                {t.status}
              </Chip>
              <strong>{t.subject}</strong>
              <span className="muted">
                {t.priority} · opened {t.openedAt}
                {t.resolvedAt && ` · resolved ${t.resolvedAt}`}
              </span>
            </>
          )}
          onDelete={(id) => vendorApi.tickets.remove(id)}
          reload={reload}
          form={<TicketForm accountId={account.id} onDone={reload} />}
          extra={(t: Ticket) =>
            t.status !== "RESOLVED" ? (
              <button
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  await vendorApi.tickets.update(t.id, {
                    ...t,
                    status: "RESOLVED",
                    resolvedAt: todayIso(),
                  });
                  await reload();
                }}
              >
                Resolve
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field" style={{ minWidth: 150, flex: 1 }}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** A titled list with an add form and a delete on each row. */
function Children<T extends { id: string }>({
  title,
  rows,
  empty,
  render,
  onDelete,
  reload,
  form,
  extra,
}: {
  title: string;
  rows: T[] | null;
  empty: string;
  render: (row: T) => React.ReactNode;
  onDelete: (id: string) => Promise<unknown>;
  reload: () => Promise<void>;
  form: React.ReactNode;
  extra?: (row: T) => React.ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="vendor-section">
      <div className="vendor-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          {title} {rows && rows.length > 0 && <span className="muted">({rows.length})</span>}
        </h3>
        <button className="btn btn-outline btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {adding && <div className="comp-form">{form}</div>}

      {!rows ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <p className="section-hint">{empty}</p>
      ) : (
        <ul className="vendor-list">
          {rows.map((r) => (
            <li key={r.id} className="vendor-list-row">
              <div className="vendor-list-main">{render(r)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {extra?.(r)}
                <button
                  className="btn btn-outline btn-sm"
                  onClick={async () => {
                    await onDelete(r.id);
                    await reload();
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- add forms */

function ContactForm({ accountId, onDone }: { accountId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ name: "", role: "", phone: "", email: "", primary: false });
  return (
    <>
      <div className="form-row">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Role">
          <input className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="input" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input type="checkbox" checked={f.primary} onChange={(e) => setF({ ...f, primary: e.target.checked })} />
        <span>Decisions go through this person</span>
      </label>
      <button
        className="btn btn-primary btn-sm"
        disabled={!f.name.trim()}
        onClick={async () => {
          await vendorApi.contacts.create({ accountId, ...f, name: f.name.trim() });
          await onDone();
        }}
      >
        Add contact
      </button>
    </>
  );
}

function ActivityForm({ accountId, onDone }: { accountId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ kind: "CALL", at: todayIso(), summary: "" });
  return (
    <>
      <div className="form-row">
        <Field label="What">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <input className="input" type="date" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
        </Field>
        <Field label="What was said">
          <input
            className="input"
            value={f.summary}
            onChange={(e) => setF({ ...f, summary: e.target.value })}
          />
        </Field>
      </div>
      <button
        className="btn btn-primary btn-sm"
        disabled={!f.summary.trim()}
        onClick={async () => {
          await vendorApi.activities.create({ accountId, ...f, summary: f.summary.trim() });
          await onDone();
        }}
      >
        Add to timeline
      </button>
    </>
  );
}

function DealForm({ accountId, onDone }: { accountId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({
    plan: "STANDARD", seats: 10, amountAfn: 0, term: "YEARLY", status: "DRAFT", quotedAt: todayIso(),
  });
  return (
    <>
      <div className="form-row">
        <Field label="Plan">
          <select className="select" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>
            {["FREE", "STANDARD", "ENTERPRISE"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Seats">
          <input className="input" type="number" min={1} value={f.seats} onChange={(e) => setF({ ...f, seats: Number(e.target.value) })} />
        </Field>
        <Field label="Amount (AFN)">
          <input className="input" type="number" min={0} value={f.amountAfn} onChange={(e) => setF({ ...f, amountAfn: Number(e.target.value) })} />
        </Field>
        <Field label="Term">
          <select className="select" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>
            {["YEARLY", "MONTHLY", "ONE_OFF"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {["DRAFT", "SENT", "ACCEPTED", "REJECTED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={async () => {
          await vendorApi.deals.create({ accountId, ...f });
          await onDone();
        }}
      >
        Add quote
      </button>
    </>
  );
}

function InvoiceForm({ accountId, onDone }: { accountId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({
    number: "", amountAfn: 0, issuedAt: todayIso(), dueAt: "", status: "DRAFT", period: "",
  });
  return (
    <>
      <div className="form-row">
        <Field label="Number">
          <input className="input" dir="ltr" placeholder="INV-001" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        </Field>
        <Field label="Amount (AFN)">
          <input className="input" type="number" min={0} value={f.amountAfn} onChange={(e) => setF({ ...f, amountAfn: Number(e.target.value) })} />
        </Field>
        <Field label="Issued">
          <input className="input" type="date" value={f.issuedAt} onChange={(e) => setF({ ...f, issuedAt: e.target.value })} />
        </Field>
        <Field label="Due">
          <input className="input" type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {["DRAFT", "SENT", "PAID", "VOID"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Covers">
        <input className="input" placeholder="1404 renewal, 25 seats" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
      </Field>
      <button
        className="btn btn-primary btn-sm"
        disabled={!f.number.trim()}
        onClick={async () => {
          await vendorApi.invoices.create({
            accountId, ...f, number: f.number.trim(), dueAt: f.dueAt || null, period: f.period || null,
          });
          await onDone();
        }}
      >
        Add invoice
      </button>
    </>
  );
}

function TicketForm({ accountId, onDone }: { accountId: string; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ subject: "", priority: "NORMAL", openedAt: todayIso(), detail: "" });
  return (
    <>
      <div className="form-row">
        <Field label="Subject">
          <input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </Field>
        <Field label="Priority">
          <select className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Opened">
          <input className="input" type="date" value={f.openedAt} onChange={(e) => setF({ ...f, openedAt: e.target.value })} />
        </Field>
      </div>
      <Field label="Detail">
        <textarea className="input" rows={2} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} />
      </Field>
      <button
        className="btn btn-primary btn-sm"
        disabled={!f.subject.trim()}
        onClick={async () => {
          await vendorApi.tickets.create({
            accountId, ...f, subject: f.subject.trim(), detail: f.detail || null,
          });
          await onDone();
        }}
      >
        Add issue
      </button>
    </>
  );
}
