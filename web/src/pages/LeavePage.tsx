import { useState } from "react";
import { useDecideLeave, usePendingApprovals } from "../api/hooks";
import type { LeaveRequest } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

export function LeavePage() {
  const { t, num, shamsi } = useI18n();
  const approvals = usePendingApprovals();
  const decide = useDecideLeave();
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function onDecide(req: LeaveRequest, decision: "APPROVE" | "REJECT") {
    let note: string | null = null;
    if (decision === "REJECT") {
      note = window.prompt(t("leave_reject_prompt")) ?? "";
      if (!note.trim()) return; // rejection requires a note (server enforces too)
    }
    setBusyId(req.id);
    try {
      await decide.mutateAsync({ id: req.id, decision, note });
      flash(decision === "APPROVE" ? t("leave_approved") : t("leave_rejected"));
    } catch {
      flash(t("common_error"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("leave_title")}</h1>
      </div>

      {approvals.isLoading ? (
        <LoadingState />
      ) : approvals.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void approvals.refetch()} />
      ) : (approvals.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("leave_empty")} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("leave_employee")}</th>
                <th>{t("leave_dates")}</th>
                <th>{t("leave_days")}</th>
                <th>{t("leave_reason")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {approvals.data!.map((req) => (
                <tr key={req.id}>
                  <td>{req.employeeName ?? req.employeeId}</td>
                  <td>
                    {shamsi(req.startDate)} – {shamsi(req.endDate, { withYear: true })}
                  </td>
                  <td>
                    {num(req.days)} {t("common_days")}
                  </td>
                  <td style={{ whiteSpace: "normal", maxWidth: 280 }}>{req.reason}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busyId === req.id}
                        onClick={() => void onDecide(req, "APPROVE")}
                      >
                        {t("leave_approve")}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busyId === req.id}
                        onClick={() => void onDecide(req, "REJECT")}
                      >
                        {t("leave_reject")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
