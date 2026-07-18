import { useMemo, useState } from "react";
import { useAttendanceOverview } from "../api/hooks";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip } from "../ui/components";

export function AttendancePage() {
  const { t, num, shamsi } = useI18n();
  const [date, setDate] = useState(isoToday());
  const overview = useAttendanceOverview(date);

  const summary = useMemo(() => {
    const rows = overview.data ?? [];
    const present = rows.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
    return { present, absent: rows.length - present, total: rows.length };
  }, [overview.data]);

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("att_title")}</h1>
        <div className="topbar-right">
          <span className="user-chip">{shamsi(date, { withYear: true })}</span>
          <input
            className="input"
            type="date"
            dir="ltr"
            style={{ width: "auto" }}
            value={date}
            max={isoToday()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {overview.isLoading ? (
        <LoadingState />
      ) : overview.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void overview.refetch()} />
      ) : (overview.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("att_empty")} />
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="value">{num(summary.present)}</div>
              <div className="label">{t("att_present")}</div>
            </div>
            <div className="kpi accent-red">
              <div className="value">{num(summary.absent)}</div>
              <div className="label">{t("att_absent")}</div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("leave_employee")}</th>
                  <th>{t("emp_status")}</th>
                  <th>{t("att_first_in")}</th>
                  <th>{t("att_worked")}</th>
                </tr>
              </thead>
              <tbody>
                {overview.data!.map((r) => (
                  <tr key={r.employeeId}>
                    <td>{r.employeeName}</td>
                    <td>
                      <StatusChip status={r.status} />
                      {r.lateMinutes > 0 && (
                        <span className="chip chip-warning" style={{ marginInlineStart: 8 }}>
                          {t("att_late_by", num(r.lateMinutes))}
                        </span>
                      )}
                    </td>
                    <td dir="ltr">{r.firstInAt ? formatTime(r.firstInAt, num) : "—"}</td>
                    <td>
                      {r.workedMinutes > 0
                        ? `${num(Math.floor(r.workedMinutes / 60))}:${num(
                            String(r.workedMinutes % 60).padStart(2, "0"),
                          )}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function formatTime(iso: string, num: (v: string | number) => string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return num(`${hh}:${mm}`);
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
