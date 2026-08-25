import { useMemo, useState } from "react";
import {
  useAttendanceOverview,
  useDecideRegularization,
  usePendingRegularizations,
} from "../api/hooks";
import type { Regularization } from "../api/types";
import { api } from "../api/client";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { isoTodayIn, isViewerDayDifferent } from "../time";
import { AttendanceWeekly } from "./AttendanceWeekly";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";

export function AttendancePage() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  const { me } = useAuth();
  // Attendance belongs to the company's calendar day. A manager viewing from
  // another timezone must not be shown their own "today" — in Ottawa that is
  // yesterday in Kabul, and the board would look empty.
  const timeZone = me?.timezone ?? "Asia/Kabul";
  const companyToday = isoTodayIn(timeZone);
  const [date, setDate] = useState(companyToday);
  const overview = useAttendanceOverview(date, timeZone);

  const canApprove = can("attendance:approve");
  const [preview, setPreview] = useState<string | null>(null);

  // Fetched only when a manager actually opens a photo.
  async function openSelfie(employeeId: string) {
    try {
      const { data } = await api.get<{ selfie: string }>(
        `/attendance/days/${employeeId}/${date}/selfie`,
      );
      setPreview(data.selfie);
    } catch {
      setPreview(null);
    }
  }
  const [view, setView] = useState<"daily" | "weekly">("daily");

  const summary = useMemo(() => {
    const rows = overview.data ?? [];
    const present = rows.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
    // One "look at this" count: an unverified face and a refused punch are
    // both things a manager has to act on.
    const needsReview = rows.filter((r) => r.needsReview || r.rejectedCount > 0).length;
    return { present, absent: rows.length - present, needsReview, total: rows.length };
  }, [overview.data]);

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("att_title")}</h1>
        <div className="topbar-right">
          {/* Only surfaces when the viewer is in another country, where "today"
              on their own clock is not the company's working day. */}
          {isViewerDayDifferent(timeZone) && (
            <span className="chip chip-neutral" title={timeZone}>
              {t("att_company_time")}
            </span>
          )}
          <div className="chip-set">
            <button
              className={`chip-toggle${view === "daily" ? " on" : ""}`}
              onClick={() => setView("daily")}
            >
              {t("att_view_daily")}
            </button>
            <button
              className={`chip-toggle${view === "weekly" ? " on" : ""}`}
              onClick={() => setView("weekly")}
            >
              {t("att_view_weekly")}
            </button>
          </div>
          <span className="user-chip">{shamsi(date, { withYear: true })}</span>
          <input
            className="input"
            type="date"
            dir="ltr"
            style={{ width: "auto" }}
            value={date}
            max={companyToday}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {canApprove && <RegularizationApprovals />}

      {view === "weekly" ? (
        <AttendanceWeekly date={date} />
      ) : overview.isLoading ? (
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
            {/* Only shown when there is something to act on, so it never adds noise. */}
            {summary.needsReview > 0 && (
              <div className="kpi accent-amber">
                <div className="value">{num(summary.needsReview)}</div>
                <div className="label">{t("att_needs_review")}</div>
              </div>
            )}
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
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        {r.hasCheckInSelfie && (
                          <button
                            type="button"
                            className="selfie-thumb selfie-thumb-button"
                            title={t("att_view_selfie")}
                            onClick={() => void openSelfie(r.employeeId)}
                          >
                            ◉
                          </button>
                        )}
                        {r.employeeName}
                        {r.checkInFaceVerified && (
                          <span className="verified-tick" title={t("att_face_verified")}>
                            ✓
                          </span>
                        )}
                        {/* Only reached when a non-active employee still has a
                            day record — worth saying so rather than looking
                            like a roster mistake. */}
                        {r.employeeStatus !== "ACTIVE" && (
                          <span className="chip chip-neutral">{t("att_inactive")}</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <StatusChip status={r.status} />
                      {r.lateMinutes > 0 && (
                        <span className="chip chip-warning" style={{ marginInlineStart: 8 }}>
                          {t("att_late_by", num(r.lateMinutes))}
                        </span>
                      )}
                      {r.needsReview && (
                        <span
                          className="chip chip-warning"
                          style={{ marginInlineStart: 8 }}
                          title={t("att_needs_review_hint")}
                        >
                          {t("att_needs_review")}
                        </span>
                      )}
                      {/* A refused punch is why an otherwise-worked day can read
                          as empty; say which rule rejected it, and when. */}
                      {r.rejectedCount > 0 && (
                        <span
                          className="chip chip-negative"
                          style={{ marginInlineStart: 8 }}
                          title={t(
                            "att_rejected_hint",
                            t(rejectReasonKey(r.rejectedReason)),
                            r.rejectedAt ? formatTime(r.rejectedAt, num, timeZone) : "—",
                          )}
                        >
                          {t(rejectReasonKey(r.rejectedReason))}
                          {r.rejectedCount > 1 && ` (${num(r.rejectedCount)})`}
                        </span>
                      )}
                    </td>
                    <td dir="ltr">{r.firstInAt ? formatTime(r.firstInAt, num, timeZone) : "—"}</td>
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

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <img src={preview} className="selfie-full" alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

/** Manager review of employee-filed attendance corrections (attendance:approve). */
function RegularizationApprovals() {
  const { t, num, shamsi } = useI18n();
  const { me } = useAuth();
  const timeZone = me?.timezone ?? "Asia/Kabul";
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
        <span className="chip chip-warning chip-count" style={{ marginInlineStart: 8 }}>
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
                <td dir="ltr">{req.requestedInAt ? formatTime(req.requestedInAt, num, timeZone) : "—"}</td>
                <td dir="ltr">{req.requestedOutAt ? formatTime(req.requestedOutAt, num, timeZone) : "—"}</td>
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

/** Server invalidReason → translation key, so the manager sees a rule, not a code. */
function rejectReasonKey(reason: string | null): string {
  switch (reason) {
    case "GEOFENCE_VIOLATION":
      return "att_reason_geofence";
    case "TIME_SKEW":
      return "att_reason_time_skew";
    case "TOO_OLD":
      return "att_reason_too_old";
    case "IMPLAUSIBLE_TRAVEL":
      return "att_reason_travel";
    case "KIOSK_TOKEN_INVALID":
      return "att_reason_kiosk";
    default:
      return "att_reason_unknown";
  }
}

/**
 * Renders a punch time in the company's zone. Using the viewer's clock would
 * show a Kabul morning check-in as the previous evening for a manager abroad.
 */
function formatTime(
  iso: string,
  num: (v: string | number) => string,
  timeZone: string,
): string {
  return num(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

