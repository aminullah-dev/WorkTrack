import type { ReactNode } from "react";
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
        <Kpi value={num(k.activeEmployees)} label={t("dash_active_employees")} icon={<IcPeople />} />
        <Kpi value={num(k.present)} label={t("dash_present")} icon={<IcCheck />} />
        <Kpi value={num(k.absent)} label={t("dash_absent")} accent="red" icon={<IcCross />} />
        <Kpi value={num(k.onLeave)} label={t("dash_on_leave")} icon={<IcPlane />} />
        <Kpi value={num(k.late)} label={t("dash_late")} accent="amber" icon={<IcClock />} />
        <Kpi value={num(k.halfDay)} label={t("dash_half_day")} icon={<IcHalf />} />
        <Kpi
          value={num(k.pendingLeaveRequests)}
          label={t("dash_pending_leave")}
          accent="amber"
          icon={<IcInbox />}
        />
        <Kpi value={`${num(k.attendanceRate)}٪`} label={t("dash_attendance_rate")} icon={<IcTrend />} />
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
  icon,
}: {
  value: string;
  label: string;
  accent?: "red" | "amber";
  icon?: ReactNode;
}) {
  return (
    <div className={`kpi${accent ? ` accent-${accent}` : ""}`}>
      {icon && <span className="kpi-icon">{icon}</span>}
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

/* ---- KPI icons ---- */
function Ic({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IcPeople = () => (
  <Ic><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M17 14.4A5.5 5.5 0 0 1 20.5 20" /></Ic>
);
const IcCheck = () => (
  <Ic><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4L16 9.5" /></Ic>
);
const IcCross = () => (
  <Ic><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></Ic>
);
const IcPlane = () => (
  <Ic><path d="M10.5 13.5 3 12l18-7-7 18-3.5-7.5L10.5 13.5Z" /></Ic>
);
const IcClock = () => (
  <Ic><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Ic>
);
const IcHalf = () => (
  <Ic><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none" opacity="0.35" /></Ic>
);
const IcInbox = () => (
  <Ic><path d="M3 13h4l2 3h6l2-3h4" /><path d="M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4L5 5Z" /></Ic>
);
const IcTrend = () => (
  <Ic><path d="M4 16l5-5 3 3 7-7" /><path d="M14 7h5v5" /></Ic>
);

/**
 * Smooth area/line trend — a tasteful borrow from the reference designs, kept
 * high-contrast. Fixed viewBox scales responsively; non-scaling strokes stay
 * crisp. Rendered left→right (time increasing), the convention even in RTL.
 */
function Trend({ points }: { points: { present: number; cap: string; isToday: boolean }[] }) {
  const { num } = useI18n();
  const W = 720;
  const H = 200;
  const padX = 18;
  const padTop = 30;
  const padBottom = 14;
  const max = Math.max(1, ...points.map((p) => p.present));
  const n = points.length;

  const xy = points.map((p, i) => {
    const x = n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX);
    const y = padTop + (1 - p.present / max) * (H - padTop - padBottom);
    return [x, y] as const;
  });
  const line = smoothPath(xy);
  const area = `${line} L ${xy[n - 1][0]},${H - padBottom} L ${xy[0][0]},${H - padBottom} Z`;
  const today = points.findIndex((p) => p.isToday);
  const todayPt = today >= 0 ? xy[today] : null;

  return (
    <>
      <svg className="linechart" viewBox={`0 0 ${W} ${H}`} role="img">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={W - padX}
            y1={padTop + f * (H - padTop - padBottom)}
            y2={padTop + f * (H - padTop - padBottom)}
            className="grid"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill="url(#trendFill)" />
        <path d={line} className="stroke" fill="none" vectorEffect="non-scaling-stroke" />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={points[i].isToday ? 5 : 3.5} className="dot" />
        ))}
        {todayPt && (
          <g>
            <line x1={todayPt[0]} x2={todayPt[0]} y1={todayPt[1]} y2={H - padBottom} className="marker" />
            <g transform={`translate(${todayPt[0]}, 16)`}>
              <rect x={-20} y={-13} width={40} height={22} rx={11} className="bubble" />
              <text x={0} y={2} className="bubble-txt">
                {num(points[today].present)}
              </text>
            </g>
          </g>
        )}
      </svg>
      <div className="linechart-caps">
        {points.map((p, i) => (
          <span key={i} className={p.isToday ? "cap today" : "cap"}>
            {p.cap}
          </span>
        ))}
      </div>
    </>
  );
}

/** Catmull-Rom → cubic Bézier for a smooth curve through the points. */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
