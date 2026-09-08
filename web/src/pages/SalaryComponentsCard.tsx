import { useState } from "react";
import { useSalaryComponents, useSaveSalaryComponent } from "../api/hooks";
import type { SalaryComponent, SalaryComponentWrite } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Switch, Toast } from "../ui/components";

/**
 * Allowances, deductions and employer costs.
 *
 * These are the only way anything other than basic pay, income tax and the
 * absence deduction reaches a payslip. Until this screen existed the collection
 * had an API and no way in, so a company could not give anyone a transport
 * allowance.
 *
 * It lives on the payroll page rather than in settings on purpose: writing a
 * component needs `payroll:run`, which the payroll administrator holds and the
 * settings page — gated on `settings:write` — would have hidden from them.
 */

const TYPES = ["EARNING", "DEDUCTION", "EMPLOYER_COST"] as const;

/**
 * Percent-of-gross is not offered for an earning, and that is not an oversight
 * in this form: gross is the sum of the earnings, so an earning derived from it
 * is circular. Payroll resolves that by treating such a component as a fixed
 * amount — 10 would pay 10 afghani, not 10 percent — so offering the choice
 * here would quietly produce a wrong payslip.
 */
function calcsFor(type: SalaryComponent["type"]): SalaryComponent["calc"][] {
  return type === "EARNING"
    ? ["FIXED", "PERCENT_OF_BASIC"]
    : ["FIXED", "PERCENT_OF_BASIC", "PERCENT_OF_GROSS"];
}

const BLANK: SalaryComponentWrite = {
  name: "",
  code: "",
  type: "EARNING",
  calc: "FIXED",
  value: 0,
  taxable: true,
  scope: "ALL",
  active: true,
};

export function SalaryComponentsCard() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const canManage = can("payroll:run");

  const components = useSalaryComponents();
  const save = useSaveSalaryComponent();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SalaryComponentWrite>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  function reset() {
    setForm(BLANK);
    setEditingId(null);
    setError(null);
    setOpen(false);
  }

  function startNew() {
    setForm(BLANK);
    setEditingId(null);
    setError(null);
    setOpen(true);
  }

  function startEdit(c: SalaryComponent) {
    const { id, ...rest } = c;
    void id;
    setForm(rest);
    setEditingId(c.id);
    setError(null);
    setOpen(true);
  }

  function setType(type: SalaryComponent["type"]) {
    // Switching away from an earning keeps the calc; switching to one may leave
    // percent-of-gross selected, which this form does not offer.
    const calcs = calcsFor(type);
    setForm((f) => ({
      ...f,
      type,
      calc: calcs.includes(f.calc) ? f.calc : "FIXED",
    }));
  }

  async function submit() {
    setError(null);
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();

    if (!name) return setError(t("comp_err_name"));
    if (!/^[A-Z0-9_]{1,24}$/.test(code)) return setError(t("comp_err_code"));
    if (!Number.isFinite(form.value) || form.value < 0) return setError(t("comp_err_value"));
    if (form.calc !== "FIXED" && form.value > 100) return setError(t("comp_err_percent"));

    try {
      await save.mutateAsync({
        id: editingId ?? undefined,
        body: { ...form, name, code },
      });
      flash(t("comp_saved"));
      reset();
    } catch (err) {
      // The server refuses a duplicate code; say which one rather than "error".
      const message = err instanceof Error ? err.message : "";
      setError(/exists/i.test(message) ? t("comp_err_duplicate", code) : t("common_error"));
    }
  }

  /** Deactivating keeps the history: payroll ignores it, past payslips keep it. */
  async function toggleActive(c: SalaryComponent) {
    const { id, ...rest } = c;
    try {
      await save.mutateAsync({ id, body: { ...rest, active: !c.active } });
      flash(c.active ? t("comp_deactivated") : t("comp_activated"));
    } catch {
      flash(t("common_error"));
    }
  }

  const rows = components.data ?? [];
  const byType = (type: SalaryComponent["type"]) => rows.filter((c) => c.type === type);

  function amountOf(c: SalaryComponent): string {
    if (c.calc === "FIXED") return `${num(c.value)} ${t("comp_afn")}`;
    return `${num(c.value)}٪ ${
      c.calc === "PERCENT_OF_BASIC" ? t("comp_of_basic") : t("comp_of_gross")
    }`;
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{t("comp_title")}</h2>
          <p className="section-hint">{t("comp_hint")}</p>
        </div>
        {canManage && !open && (
          <button className="btn btn-primary btn-sm" onClick={startNew}>
            {t("comp_add")}
          </button>
        )}
      </div>

      {open && canManage && (
        <div className="comp-form">
          <div className="form-row">
            <label className="field" style={{ flex: 2, minWidth: 180 }}>
              <span className="label">{t("comp_name")}</span>
              <input
                className="input"
                placeholder={t("comp_name_ph")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <div className="field" style={{ minWidth: 130 }}>
              <label className="label" htmlFor="comp-code">
                {t("comp_code")}
              </label>
              <input
                id="comp-code"
                aria-describedby="comp-code-hint"
                className="input"
                dir="ltr"
                placeholder="TRANSPORT"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
              <span className="hint" id="comp-code-hint">
                {t("comp_code_hint")}
              </span>
            </div>

            <label className="field" style={{ minWidth: 150 }}>
              <span className="label">{t("comp_type")}</span>
              <select
                className="select"
                value={form.type}
                onChange={(e) => setType(e.target.value as SalaryComponent["type"])}
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`comp_type_${ty.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </label>

            <div className="field" style={{ minWidth: 190 }}>
              <label className="label" htmlFor="comp-scope">
                {t("comp_scope")}
              </label>
              <select
                id="comp-scope"
                aria-describedby="comp-scope-hint"
                className="select"
                value={form.scope}
                onChange={(e) =>
                  setForm({ ...form, scope: e.target.value as SalaryComponent["scope"] })
                }
              >
                <option value="ALL">{t("comp_scope_all")}</option>
                <option value="INDIVIDUAL">{t("comp_scope_individual")}</option>
              </select>
              <span className="hint" id="comp-scope-hint">
                {t("comp_scope_hint")}
              </span>
            </div>
          </div>

          <div className="form-row">
            <div className="field" style={{ minWidth: 190 }}>
              <label className="label" htmlFor="comp-calc">
                {t("comp_calc")}
              </label>
              <select
                id="comp-calc"
                aria-describedby={form.type === "EARNING" ? "comp-calc-hint" : undefined}
                className="select"
                value={form.calc}
                onChange={(e) =>
                  setForm({ ...form, calc: e.target.value as SalaryComponent["calc"] })
                }
              >
                {calcsFor(form.type).map((c) => (
                  <option key={c} value={c}>
                    {t(`comp_calc_${c.toLowerCase()}`)}
                  </option>
                ))}
              </select>
              {form.type === "EARNING" && (
                <span className="hint" id="comp-calc-hint">
                  {t("comp_calc_earning_hint")}
                </span>
              )}
            </div>

            <label className="field" style={{ minWidth: 140 }}>
              <span className="label">
                {form.calc === "FIXED" ? t("comp_value_afn") : t("comp_value_percent")}
              </span>
              <input
                className="input"
                type="number"
                dir="ltr"
                min={0}
                step={form.calc === "FIXED" ? 100 : 0.5}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              />
            </label>

            {form.type === "EARNING" && (
              <div className="field" style={{ minWidth: 190 }}>
                <span className="label" id="comp-taxable-label">{t("comp_taxable")}</span>
                <label
                  aria-labelledby="comp-taxable-label"
                  style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}
                >
                  <Switch
                    checked={form.taxable}
                    onChange={(v) => setForm({ ...form, taxable: v })}
                    label={t("comp_taxable")}
                  />
                  <span>{form.taxable ? t("common_yes") : t("common_no")}</span>
                </label>
                <span className="hint">{t("comp_taxable_hint")}</span>
              </div>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn btn-primary" disabled={save.isPending} onClick={() => void submit()}>
              {save.isPending ? t("common_saving") : t("common_save")}
            </button>
            <button className="btn btn-outline" onClick={reset}>
              {t("common_cancel")}
            </button>
          </div>
        </div>
      )}

      {components.isLoading ? (
        <LoadingState />
      ) : components.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void components.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("comp_empty")} />
      ) : (
        TYPES.filter((ty) => byType(ty).length > 0).map((ty) => (
          <div key={ty} style={{ marginTop: 16 }}>
            <h3 className="comp-group">{t(`comp_type_${ty.toLowerCase()}`)}</h3>
            <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("comp_name")}</th>
                    <th>{t("comp_amount")}</th>
                    <th>{t("comp_scope")}</th>
                    {ty === "EARNING" && <th>{t("comp_taxable")}</th>}
                    <th>{t("comp_status")}</th>
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {byType(ty).map((c) => (
                    <tr key={c.id} style={{ opacity: c.active ? 1 : 0.55 }}>
                      <td>
                        <div>{c.name}</div>
                        <div className="muted" dir="ltr" style={{ fontSize: 12 }}>
                          {c.code}
                        </div>
                      </td>
                      {/* No dir override: the string is "500 افغانی" — number
                          then unit — and forcing LTR here reordered it on
                          screen to "افغانی 500". */}
                      <td style={{ whiteSpace: "nowrap" }}>{amountOf(c)}</td>
                      <td>
                        <Chip tone={c.scope === "INDIVIDUAL" ? "warning" : "neutral"}>
                          {c.scope === "INDIVIDUAL"
                            ? t("comp_scope_individual")
                            : t("comp_scope_all")}
                        </Chip>
                      </td>
                      {ty === "EARNING" && (
                        <td>
                          <Chip tone={c.taxable ? "neutral" : "positive"}>
                            {c.taxable ? t("common_yes") : t("comp_tax_exempt")}
                          </Chip>
                        </td>
                      )}
                      <td>
                        <Chip tone={c.active ? "positive" : "neutral"}>
                          {c.active ? t("comp_active") : t("comp_inactive")}
                        </Chip>
                      </td>
                      {canManage && (
                        <td style={{ textAlign: "end", whiteSpace: "nowrap" }}>
                          <button className="btn btn-outline btn-sm" onClick={() => startEdit(c)}>
                            {t("comp_edit")}
                          </button>{" "}
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={save.isPending}
                            onClick={() => void toggleActive(c)}
                          >
                            {c.active ? t("comp_deactivate") : t("comp_activate")}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {rows.length > 0 && <p className="section-hint" style={{ marginTop: 14 }}>{t("comp_rerun_hint")}</p>}

      {toast && <Toast message={toast} />}
    </div>
  );
}
