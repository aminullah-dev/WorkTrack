import { useMemo, useState } from "react";
import {
  useAttendanceOverview,
  useDecideRegularization,
  usePendingRegularizations,
} from "../api/hooks";
import type { Regularization } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";

export function AttendancePage() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  const [date, setDate] = useState(isoToday());
  const overview = useAttendanceOverview(date);

  const canApprove = can("attendance:approve");

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

      {canApprove && <RegularizationApprovals />}

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

/** Manager review of employee-filed attendance corrections (attendance:approve). */
function RegularizationApprovals() {
  const { t, num, shamsi } = useI18n();
  const pending = usePendingRegularizations(true);
  const decide = useDecideRegularization();
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function onDecide(req: Regularization, decision: "APPROVE" | "REJECT") {
    let note: string | null = null;
    if (decision === "REJECT") {
      note = window.prompt(t("reg_reject_prompt")) ?? "";
      if (!note.trim()) return; // rejection requires a note
    }
    setBusyId(req.id);
    try {
      await decide.mutateAsync({ id: req.id, decision, note });
      flash(decision === "APPROVE" ? t("reg_approved") : t("reg_rejected"));
    } catch {
      flash(t("common_error"));
    } finally {
      setBusyId(null);
    }
  }

  const rows = pending.data ?? [];
  // Hide the whole block when there is nothing to review, so it never adds noise.
  if (pending.isLoading || pending.isError || rows.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 20, padding: 0 }}>
      <h2 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>
        {t("reg_pending")}{" "}
        <span className="chip chip-warning" style={{ marginInlineStart: 8 }}>
          {num(rows.length)}
        </span>
      </h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{t("leave_employee")}</th>
              <th>{t("reg_date")}</th>
              <th>{t("reg_requested_in")}</th>
              <th>{t("reg_requested_out")}</th>
              <th>{t("reg_reason")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((req) => (
              <tr key={req.id}>
                <td>{req.employeeName ?? req.employeeId}</td>
                <td>{shamsi(req.date, { withYear: true })}</td>
                <td dir="ltr">{req.requestedInAt ? formatTime(req.requestedInAt, num) : "—"}</td>
                <td dir="ltr">{req.requestedOutAt ? formatTime(req.requestedOutAt, num) : "—"}</td>
                <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{req.reason}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busyId === req.id}
                      onClick={() => void onDecide(req, "APPROVE")}
                    >
                      {t("reg_approve")}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={busyId === req.id}
                      onClick={() => void onDecide(req, "REJECT")}
                    >
                      {t("reg_reject")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast && <Toast message={toast} />}
    </section>
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
