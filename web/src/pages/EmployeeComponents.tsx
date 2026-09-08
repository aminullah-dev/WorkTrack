import { useState } from "react";
import {
  useClearEmployeeComponent,
  useEmployeeComponents,
  useSalaryComponents,
  useSetEmployeeComponent,
} from "../api/hooks";
import type { ComponentAssignment, SalaryComponent } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, LoadingState, Switch } from "../ui/components";

/**
 * One employee's exceptions against the company's salary components.
 *
 * The company defines "transport allowance, 2000". Here you say that this
 * person gets 3500 of it, or none of it, or that they are one of the few who
 * get the site bonus at all. Nothing is stored unless it differs from what the
 * component already does — clearing a row deletes the assignment rather than
 * writing "same as everyone", so the company-wide figure keeps flowing through
 * when it later changes.
 */
export function EmployeeComponents({ employeeId }: { employeeId: string | null }) {
  const { t, num } = useI18n();
  const components = useSalaryComponents();
  const assignments = useEmployeeComponents(employeeId);
  const setOne = useSetEmployeeComponent();
  const clearOne = useClearEmployeeComponent();

  // Only the row being edited is tracked locally; everything else reads from
  // the server, so two managers editing different people cannot collide.
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (!employeeId) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="comp-group">{t("empc_title")}</h3>
        <p className="section-hint">{t("empc_save_first")}</p>
      </div>
    );
  }

  if (components.isLoading || assignments.isLoading) return <LoadingState />;

  const all = (components.data ?? []).filter((c) => c.active);
  if (all.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="comp-group">{t("empc_title")}</h3>
        <EmptyState message={t("empc_none")} />
      </div>
    );
  }

  const byId = new Map((assignments.data ?? []).map((a) => [a.componentId, a]));

  /**
   * What this employee gets today, before any edit in this dialog.
   *
   * Tested against INDIVIDUAL rather than for ALL so that a component arriving
   * without a scope — one written before the field existed, or an older server
   * — reads as company-wide, which is what the server does with it. Defaulting
   * the other way would show a live allowance as not applying, and one click
   * would then withhold it.
   */
  function appliesByDefault(c: SalaryComponent): boolean {
    return c.scope !== "INDIVIDUAL";
  }

  function applies(c: SalaryComponent, a: ComponentAssignment | undefined): boolean {
    return a ? a.active : appliesByDefault(c);
  }

  async function toggle(c: SalaryComponent, next: boolean) {
    const a = byId.get(c.id);
    const backToDefault = next === appliesByDefault(c);
    // Returning to the component's own behaviour means removing the exception,
    // not recording one that happens to match — otherwise a later change to the
    // company figure would not reach this person.
    if (backToDefault && a?.value == null) {
      await clearOne.mutateAsync({ employeeId: employeeId!, componentId: c.id });
      return;
    }
    await setOne.mutateAsync({
      employeeId: employeeId!,
      componentId: c.id,
      body: { value: a?.value ?? null, active: next },
    });
  }

  async function commitAmount(c: SalaryComponent) {
    const raw = (draft[c.id] ?? "").trim();
    const a = byId.get(c.id);
    setDraft((d) => {
      const next = { ...d };
      delete next[c.id];
      return next;
    });

    if (raw === "") {
      // Cleared: back to the company amount, which for a row that applies means
      // there is no exception left to store. The box is disabled while a row is
      // withheld, so this only ever runs on a row that applies.
      if (a) await clearOne.mutateAsync({ employeeId: employeeId!, componentId: c.id });
      return;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    await setOne.mutateAsync({
      employeeId: employeeId!,
      componentId: c.id,
      body: { value, active: a ? a.active : true },
    });
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 className="comp-group">{t("empc_title")}</h3>
      <p className="section-hint">{t("empc_hint")}</p>

      <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
        <table className="data">
          <thead>
            <tr>
              <th>{t("comp_name")}</th>
              <th>{t("empc_applies")}</th>
              <th>{t("empc_amount")}</th>
            </tr>
          </thead>
          <tbody>
            {all.map((c) => {
              const a = byId.get(c.id);
              const on = applies(c, a);
              const shown = draft[c.id] ?? (a?.value != null ? String(a.value) : "");
              return (
                <tr key={c.id}>
                  <td>
                    <div>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t(`comp_type_${c.type.toLowerCase()}`)} ·{" "}
                      {appliesByDefault(c) ? t("empc_all_note") : t("empc_individual_note")} ·{" "}
                      {c.calc === "FIXED"
                        ? `${num(c.value)} ${t("comp_afn")}`
                        : `${num(c.value)}٪`}
                    </div>
                  </td>
                  <td>
                    <Switch
                      checked={on}
                      onChange={(v) => void toggle(c, v)}
                      label={`${t("empc_applies")} — ${c.name}`}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      dir="ltr"
                      style={{ maxWidth: 130 }}
                      disabled={!on}
                      placeholder={
                        c.calc === "FIXED" ? String(c.value) : `${c.value}٪`
                      }
                      value={shown}
                      onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                      onBlur={() => void commitAmount(c)}
                      aria-label={`${t("empc_amount")} — ${c.name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {t("empc_default_hint")} · {t("comp_rerun_hint")}
      </p>
    </div>
  );
}
