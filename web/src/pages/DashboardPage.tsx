import { useAttendanceTrend, useKpis } from "../api/hooks";
import { useI18n } from "../i18n/LocaleProvider";
import { ErrorState, LoadingState } from "../ui/components";
import { toShamsi } from "../shamsi/solarHijri";

export function DashboardPage() {
  const { t, num, shamsi } = useI18n();
  const kpis = useKpis();
  const trend = useAttendanceTrend();

  if (kpis.isLoading) return <LoadingState />;
  if (kpis.isError || !kpis.data) {
    return <ErrorState message={t("common_error")} onRetry={() => void kpis.refetch()} />;
  }
  const k = kpis.data;

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("dash_title")}</h1>
        <span className="user-chip">{shamsi(k.date, { withYear: true })}</span>
      </div>

      <div className="kpi-grid">
        <Kpi value={num(k.activeEmployees)} label={t("dash_active_employees")} />
        <Kpi value={num(k.present)} label={t("dash_present")} />
        <Kpi value={num(k.absent)} label={t("dash_absent")} accent="red" />
        <Kpi value={num(k.onLeave)} label={t("dash_on_leave")} />
        <Kpi value={num(k.late)} label={t("dash_late")} accent="amber" />
        <Kpi value={num(k.halfDay)} label={t("dash_half_day")} />
        <Kpi value={num(k.pendingLeaveRequests)} label={t("dash_pending_leave")} accent="amber" />
        <Kpi value={`${num(k.attendanceRate)}٪`} label={t("dash_attendance_rate")} />
      </div>

      <div className="card">
        <h2 className="card-title">{t("dash_trend")}</h2>
        {trend.data && trend.data.length > 0 ? (
          <Trend
            points={trend.data.map((p) => ({
              present: p.present,
              cap: shamsi(p.date),
              isToday: p.date === k.date,
            }))}
          />
        ) : (
          <div className="center-state">{t("common_loading")}</div>
        )}
      </div>

      {/* Keep an eye on the "as of" note reading the same Shamsi calendar. */}
      <p className="user-chip" style={{ marginTop: 12 }}>
        {t("att_date")}: {num(toShamsi(k.date).day)} {shamsi(k.date, { withYear: true })}
      </p>
    </>
  );
}

function Kpi({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: "red" | "amber";
}) {
  return (
    <div className={`kpi${accent ? ` accent-${accent}` : ""}`}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function Trend({ points }: { points: { present: number; cap: string; isToday: boolean }[] }) {
  const max = Math.max(1, ...points.map((p) => p.present));
  const { num } = useI18n();
  return (
    <div className="trend">
      {points.map((p, i) => (
        <div className="trend-bar" key={i} title={String(p.present)}>
          <span className="cap">{num(p.present)}</span>
          <div
            className={`bar${p.isToday ? " today" : ""}`}
            style={{ height: `${(p.present / max) * 100}%` }}
          />
          <span className="cap">{p.cap}</span>
        </div>
      ))}
    </div>
  );
}
