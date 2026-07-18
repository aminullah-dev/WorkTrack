import type { ReactNode } from "react";
import { useI18n } from "../i18n/LocaleProvider";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="loading" />;
}

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="center-state">
      <Spinner />
      <span>{t("common_loading")}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="center-state">
      <span style={{ color: "var(--red)" }}>{message}</span>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          {t("common_retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="center-state">{message}</div>;
}

type Tone = "positive" | "warning" | "negative" | "neutral";

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** Maps an attendance/leave status to a chip tone + localized label. */
export function StatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { tone: Tone; key: string }> = {
    PRESENT: { tone: "positive", key: "att_status_present" },
    ABSENT: { tone: "negative", key: "att_status_absent" },
    HALF_DAY: { tone: "warning", key: "att_status_half_day" },
    LEAVE: { tone: "neutral", key: "att_status_leave" },
    HOLIDAY: { tone: "neutral", key: "att_status_holiday" },
    WEEK_OFF: { tone: "neutral", key: "att_status_week_off" },
    PENDING: { tone: "warning", key: "att_status_pending" },
    ACTIVE: { tone: "positive", key: "status_active" },
    ON_LEAVE: { tone: "neutral", key: "status_on_leave" },
    SUSPENDED: { tone: "warning", key: "status_suspended" },
    EXITED: { tone: "neutral", key: "status_exited" },
  };
  const entry = map[status] ?? { tone: "neutral" as Tone, key: status };
  return <Chip tone={entry.tone}>{map[status] ? t(entry.key) : status}</Chip>;
}

export function Toast({ message }: { message: string }) {
  return <div className="toast">{message}</div>;
}

/** Accessible on/off toggle. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <span className="switch">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
    </span>
  );
}
