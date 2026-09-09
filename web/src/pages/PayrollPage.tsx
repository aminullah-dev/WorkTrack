import { useState } from "react";
import { usePayrollRuns, useRunPayroll, useRunPayslips } from "../api/hooks";
import type { PayrollRun } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";
import { shamsiToday } from "../shamsi/solarHijri";
import { AdvancesCard } from "./AdvancesCard";
import { SalaryComponentsCard } from "./SalaryComponentsCard";

const SHAMSI_MONTHS_FA = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

export function PayrollPage() {
  const { t, num, locale, shamsiMonthName } = useI18n();
  const can = useHasPermission();
  const runs = usePayrollRuns();
  const runPayroll = useRunPayroll();

  const today = shamsiToday();
  const [year, setYear] = useState(today.year);
  const [month, setMonth] = useState(today.month);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [skipped, setSkipped] = useState<Array<{ employeeId: string; name: string }>>([]);
  const [exited, setExited] = useState<Array<{ employeeId: string; name: string }>>([]);

  async function onRun() {
    const result = await runPayroll.mutateAsync({ periodYear: year, periodMonth: month });
    // People with no salary configured earn nothing and produce no payslip.
    // A run that quietly leaves them out looks complete and is not.
    setSkipped(result.skippedNoSalary ?? []);
    setExited(result.skippedExited ?? []);
    setToast(t("pay_run_done", num(result.payslipCount)));
    window.setTimeout(() => setToast(null), 2800);
  }

  if (openRun) {
    return <RunDetail runId={openRun} onBack={() => setOpenRun(null)} />;
  }

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("pay_title")}</h1>
        {can("payroll:run") && (
          <div className="topbar-right">
            <select
              className="select"
              style={{ width: "auto" }}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {SHAMSI_MONTHS_FA.map((_, i) => (
                <option key={i} value={i + 1}>
                  {shamsiMonthName(i + 1)}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ width: "auto" }}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[today.year, today.year - 1].map((y) => (
                <option key={y} value={y}>
                  {locale === "en" ? y : num(y)}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => void onRun()} disabled={runPayroll.isPending}>
              {runPayroll.isPending ? t("pay_running") : t("pay_run")}
            </button>
          </div>
        )}
      </div>

      {exited.length > 0 && (
        <div className="notice-warning">
          <strong>{t("pay_exited_title", num(exited.length))}</strong>
          <p>{t("pay_exited_body")}</p>
          <ul>
            {exited.map((e) => (
              <li key={e.employeeId}>{e.name}</li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="notice-warning">
          <strong>{t("pay_skipped_title", num(skipped.length))}</strong>
          <p>{t("pay_skipped_body")}</p>
          <ul>
            {skipped.map((e) => (
              <li key={e.employeeId}>{e.name}</li>
            ))}
          </ul>
        </div>
      )}

      {can("payroll:run") && year === today.year && month >= today.month && (
        <p className="hint-provisional">{t("pay_provisional_hint")}</p>
      )}

      {runs.isLoading ? (
        <LoadingState />
      ) : runs.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void runs.refetch()} />
      ) : (runs.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("pay_runs_empty")} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("pay_period")}</th>
                <th>{t("pay_status")}</th>
                <th>{t("pay_employees")}</th>
                <th>{t("pay_total_gross")}</th>
                <th>{t("pay_total_tax")}</th>
                <th>{t("pay_total_net")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.data!.map((run: PayrollRun) => (
                <tr key={run.id}>
                  <td>
                    {shamsiMonthName(run.periodMonth)} {locale === "en" ? run.periodYear : num(run.periodYear)}
                    {run.periodComplete === false && (
                      <span className="badge-provisional" title={t("pay_provisional_hint")}>
                        {t("pay_provisional")}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusChip status={run.status === "APPROVED" ? "PRESENT" : run.status} />
                  </td>
                  <td>{num(run.payslipCount)}</td>
                  <td>{num(money(run.totalGross))} {run.currency}</td>
                  <td>{num(money(run.totalTax))} {run.currency}</td>
                  <td>{num(money(run.totalNet))} {run.currency}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => setOpenRun(run.id)}>
                      {t("pay_view")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SalaryComponentsCard />
      <AdvancesCard />

      {toast && <Toast message={toast} />}
    </>
  );
}

function RunDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { t, num } = useI18n();
  const payslips = useRunPayslips(runId);

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("pay_title")}</h1>
        <button className="btn btn-outline btn-sm" onClick={onBack}>
          → {t("pay_back_to_runs")}
        </button>
      </div>

      {payslips.isLoading ? (
        <LoadingState />
      ) : payslips.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void payslips.refetch()} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("pay_employee")}</th>
                <th>{t("pay_gross")}</th>
                <th>{t("pay_tax")}</th>
                <th>{t("pay_deductions")}</th>
                <th>{t("pay_net")}</th>
                <th>{t("pay_ctc")}</th>
                <th>{t("pay_worked_days")}</th>
              </tr>
            </thead>
            <tbody>
              {payslips.data!.map((p) => (
                <tr key={p.id}>
                  <td>{p.employeeName}</td>
                  <td>{num(money(p.gross))} {p.currency}</td>
                  <td>{num(money(p.incomeTax))} {p.currency}</td>
                  <td>{num(money(p.totalDeductions))} {p.currency}</td>
                  <td style={{ fontWeight: 600 }}>{num(money(p.net))} {p.currency}</td>
                  <td>{num(money(p.costToCompany))} {p.currency}</td>
                  <td>{num(p.workedDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function money(n: number): string {
  return n.toLocaleString("en-US");
}
