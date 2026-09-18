import { type FormEvent, useState } from "react";
import { useAdvances, useCancelAdvance, useCreateAdvance, useEmployees } from "../api/hooks";
import { ApiError } from "../api/client";
import type { Advance } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

/**
 * Money handed to somebody before payday.
 *
 * It lives on the payroll page rather than on its own, because an advance only
 * means anything next to the run that takes it back: whoever records one is
 * about to decide what comes out of a wage, and should be looking at the
 * payroll while they do it.
 */
export function AdvancesCard() {
  const { t, num, shamsi } = useI18n();

  // Grouped, then digits localised — the same two steps the payroll table on
  // this page takes. Ungrouped, ۶۰۰۰ and ۶۰۰۰۰ are one glance apart, and this
  // column is money somebody is about to lose from a wage.
  //
  // The currency word follows the salary-components card next to it ("افغانی")
  // rather than the payroll table above it ("AFN"). Those two already disagree
  // and standardising them is a change for its own commit, not a side effect
  // of this one.
  const money = (n: number): string => `${num(n.toLocaleString("en-US"))} ${t("comp_afn")}`;
  const can = useHasPermission();
  const advances = useAdvances(null);
  const employees = useEmployees({});
  const cancel = useCancelAdvance();

  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const canWrite = can("payroll:run");

  function flash(message: string): void {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  async function onCancel(advance: Advance): Promise<void> {
    // Cancelling is not undoable and the person has the money, so it asks.
    if (!window.confirm(t("adv_cancel_confirm", advance.employeeName))) return;
    try {
      await cancel.mutateAsync(advance.id);
      flash(t("adv_cancelled"));
    } catch (err) {
      // The server refuses once anything has been repaid — a payslip was
      // issued against it, and that cannot be unsaid.
      flash(err instanceof ApiError ? err.message : t("common_error"));
    }
  }

  const rows = advances.data ?? [];
  const live = rows.filter((a) => a.status !== "CANCELLED");
  const owed = live.reduce((sum, a) => sum + a.outstanding, 0);

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="card-head">
        <div>
          <h2>{t("adv_title")}</h2>
          <p className="sub">{t("adv_sub")}</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            {t("adv_add")}
          </button>
        )}
      </div>

      {advances.isLoading ? (
        <LoadingState />
      ) : advances.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void advances.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("adv_empty")} />
      ) : (
        <>
          {owed > 0 && (
            <p className="sub" style={{ marginBottom: 12 }}>
              {t("adv_total_owed", money(owed))}
            </p>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("adv_employee")}</th>
                  <th>{t("adv_principal")}</th>
                  <th>{t("adv_instalment")}</th>
                  <th>{t("adv_outstanding")}</th>
                  <th>{t("adv_issued")}</th>
                  <th>{t("adv_status")}</th>
                  {canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.employeeName}</td>
                    <td>{money(a.principal)}</td>
                    {/* An advance with no instalment comes out in one go at the
                        next run, which is worth saying rather than showing a
                        dash somebody has to interpret. */}
                    <td>{a.instalment === null ? t("adv_in_full") : money(a.instalment)}</td>
                    <td>{money(a.outstanding)}</td>
                    <td>{shamsi(a.issuedOn, { withYear: true })}</td>
                    <td>
                      <Chip
                        tone={
                          a.status === "SETTLED"
                            ? "positive"
                            : a.status === "CANCELLED"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {t(`adv_status_${a.status.toLowerCase()}`)}
                      </Chip>
                    </td>
                    {canWrite && (
                      <td>
                        {a.status === "OUTSTANDING" && a.repaid === 0 && (
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={cancel.isPending}
                            onClick={() => void onCancel(a)}
                          >
                            {t("adv_cancel")}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <AdvanceForm
          employees={(employees.data?.data ?? []).map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`.trim(),
          }))}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            flash(t("adv_saved"));
          }}
        />
      )}

      {toast && <Toast message={toast} />}
      <p className="sub" style={{ marginTop: 14, fontSize: ".88em" }}>
        {t("adv_note")}
      </p>
    </section>
  );
}

function AdvanceForm({
  employees,
  onClose,
  onSaved,
}: {
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const create = useCreateAdvance();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    principal: "",
    // Blank means "take it all next payroll", which is right for the common
    // case: a small advance a few days before payday.
    instalment: "",
    issuedOn: isoToday(),
    note: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    const principal = Number(form.principal);
    if (!form.employeeId || !Number.isFinite(principal) || principal <= 0) {
      setError(t("adv_err_required"));
      return;
    }
    const instalment = form.instalment.trim() === "" ? null : Number(form.instalment);
    if (instalment !== null && (!Number.isFinite(instalment) || instalment <= 0)) {
      setError(t("adv_err_instalment"));
      return;
    }
    // Not a server rule, but an instalment larger than the advance is somebody
    // misreading the field, and it is cheaper to say so here.
    if (instalment !== null && instalment > principal) {
      setError(t("adv_err_instalment_big"));
      return;
    }

    try {
      await create.mutateAsync({
        employeeId: form.employeeId,
        principal,
        instalment,
        issuedOn: form.issuedOn,
        note: form.note.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void onSubmit(e)}>
        <h2>{t("adv_add")}</h2>

        <div className="field">
          <label>{t("adv_employee")}</label>
          <select
            className="select"
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
          >
            <option value="">{t("adv_pick_employee")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t("adv_principal")}</label>
            <input
              className="input"
              dir="ltr"
              inputMode="decimal"
              value={form.principal}
              onChange={(e) => set("principal", e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("adv_instalment")}</label>
            <input
              className="input"
              dir="ltr"
              inputMode="decimal"
              placeholder={t("adv_in_full")}
              value={form.instalment}
              onChange={(e) => set("instalment", e.target.value)}
            />
            <span className="sub" style={{ fontSize: ".85em" }}>{t("adv_instalment_hint")}</span>
          </div>
        </div>

        <div className="field">
          <label>{t("adv_issued")}</label>
          <input
            className="input"
            type="date"
            dir="ltr"
            value={form.issuedOn}
            onChange={(e) => set("issuedOn", e.target.value)}
          />
        </div>

        <div className="field">
          {/* adv_note is the paragraph under the table explaining WHEN the
              deduction happens. This is the field somebody types "for medicine"
              into — a different thing, and it had been sharing the key. */}
          <label>{t("adv_note_field")}</label>
          <input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t("common_cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? t("common_saving") : t("common_save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
