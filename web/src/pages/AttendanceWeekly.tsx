import { useWeeklyAttendance } from "../api/hooks";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState } from "../ui/components";

/**
 * A week of attendance, all staff at once.
 *
 * The daily board answers "who is in right now". This answers the question a
 * manager actually asks at the end of a week — who kept their hours, who was
 * short, and where the gaps fell — which needs the days side by side rather
 * than seven visits to the daily view.
 */
export function AttendanceWeekly({ date }: { date: string }) {
  const { t, num, shamsi } = useI18n();
  const { me } = useAuth();
  const timeZone = me?.timezone ?? "Asia/Kabul";
  const week = useWeeklyAttendance(date, timeZone);

  if (week.isLoading) return <LoadingState />;
  if (week.isError) {
    return <ErrorState message={t("common_error")} onRetry={() => void week.refetch()} />;
  }
  const data = week.data;
  if (!data || data.rows.length === 0) return <EmptyState message={t("att_empty")} />;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{t("leave_employee")}</th>
            {data.dates.map((d) => (
              <th key={d} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                {shamsi(d)}
              </th>
            ))}
            <th style={{ textAlign: "center" }}>{t("att_week_total")}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.employeeId}>
              <td style={{ whiteSpace: "nowrap" }}>
                {row.employeeName}
                {row.employeeStatus !== "ACTIVE" && (
                  <span className="chip chip-neutral" style={{ marginInlineStart: 8 }}>
                    {t("att_inactive")}
                  </span>
                )}
              </td>
              {row.days.map((day) => (
                <td key={day.date} style={{ textAlign: "center" }}>
                  <DayCell
                    workedMinutes={day.workedMinutes}
                    status={day.status}
                    late={day.lateMinutes > 0}
                    flagged={day.needsReview || day.rejectedCount > 0}
                    num={num}
                    lateTitle={t("att_late_by", num(day.lateMinutes))}
                    flaggedTitle={t("att_needs_review")}
                  />
                </td>
              ))}
              <td style={{ textAlign: "center", fontWeight: 600 }} dir="ltr">
                {formatHours(row.totalWorkedMinutes, num)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One day for one person. Hours are the useful number; late and flagged days
 * are marked rather than spelled out, so a week of thirty-five cells stays
 * scannable instead of becoming a wall of text.
 */
function DayCell({
  workedMinutes,
  status,
  late,
  flagged,
  num,
  lateTitle,
  flaggedTitle,
}: {
  workedMinutes: number;
  status: string;
  late: boolean;
  flagged: boolean;
  num: (v: string | number) => string;
  lateTitle: string;
  flaggedTitle: string;
}) {
  if (workedMinutes === 0 && status === "ABSENT") {
    return <span style={{ opacity: 0.35 }}>—</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} dir="ltr">
      <span>{formatHours(workedMinutes, num)}</span>
      {late && (
        <span title={lateTitle} style={{ color: "var(--amber)" }}>
          ●
        </span>
      )}
      {flagged && (
        <span title={flaggedTitle} style={{ color: "var(--red)" }}>
          ●
        </span>
      )}
    </span>
  );
}

/** "7:30" — hours and minutes, in the reader's digits. */
function formatHours(minutes: number, num: (v: string | number) => string): string {
  if (minutes === 0) return num(0);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${num(h)}:${num(String(m).padStart(2, "0"))}`;
}
