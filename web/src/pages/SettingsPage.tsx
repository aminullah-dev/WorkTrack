import { useEffect, useState } from "react";
import {
  useCreateKioskAccount,
  useKioskAccounts,
  useResetKioskAccount,
  useSettings,
  useUpdateSettings,
} from "../api/hooks";
import type { CompanyFeatures, CompanySettings, KioskAccountCreated } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, ErrorState, LoadingState, Switch, Toast } from "../ui/components";

const FEATURE_KEYS: (keyof CompanyFeatures)[] = [
  "shifts",
  "leave",
  "payroll",
  "regularization",
  "announcements",
  "geofencing",
  "qrKiosk",
  "faceRecognition",
];

const FEATURE_LABEL: Record<keyof CompanyFeatures, string> = {
  shifts: "feat_shifts",
  leave: "feat_leave",
  payroll: "feat_payroll",
  regularization: "feat_regularization",
  announcements: "feat_announcements",
  geofencing: "feat_geofencing",
  qrKiosk: "feat_qr",
  faceRecognition: "feat_face",
};

// ISO weekday numbers in Afghan week order (Saturday-first).
const WEEK_DAYS: { iso: number; key: string }[] = [
  { iso: 6, key: "wd_sat" },
  { iso: 7, key: "wd_sun" },
  { iso: 1, key: "wd_mon" },
  { iso: 2, key: "wd_tue" },
  { iso: 3, key: "wd_wed" },
  { iso: 4, key: "wd_thu" },
  { iso: 5, key: "wd_fri" },
];

export function SettingsPage() {
  const { t, num } = useI18n();
  const settings = useSettings();
  const save = useUpdateSettings();
  const [draft, setDraft] = useState<CompanySettings | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Seed the editable draft once settings load.
  useEffect(() => {
    if (settings.data && !draft) setDraft(structuredClone(settings.data));
  }, [settings.data, draft]);

  if (settings.isLoading || !draft) {
    return settings.isError ? (
      <ErrorState message={t("common_error")} onRetry={() => void settings.refetch()} />
    ) : (
      <LoadingState />
    );
  }

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function onSave() {
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      flash(t("set_saved"));
    } catch {
      flash(t("common_error"));
    }
  }

  const feature = (k: keyof CompanyFeatures) => draft.features[k];
  const setFeature = (k: keyof CompanyFeatures, v: boolean) =>
    setDraft({ ...draft, features: { ...draft.features, [k]: v } });

  const weekend = new Set(draft.policies.weekendDays);
  const toggleWeekend = (iso: number) => {
    const next = new Set(weekend);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    setDraft({ ...draft, policies: { ...draft.policies, weekendDays: [...next].sort() } });
  };

  const dailyHours = Math.round((draft.policies.standardDailyMinutes / 60) * 10) / 10;

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("set_title")}</h1>
        <button className="btn btn-primary" disabled={save.isPending} onClick={() => void onSave()}>
          {save.isPending ? t("set_saving") : t("set_save")}
        </button>
      </div>

      <div className="settings-grid">
        {/* Features (editable modules) */}
        <div className="card">
          <h2 className="card-title">{t("set_features")}</h2>
          <p className="section-hint">{t("set_features_hint")}</p>
          {FEATURE_KEYS.map((k) => (
            <div className="switch-row" key={k}>
              <div className="txt">
                <b>{t(FEATURE_LABEL[k])}</b>
              </div>
              <Switch
                checked={feature(k)}
                onChange={(v) => setFeature(k, v)}
                label={t(FEATURE_LABEL[k])}
              />
            </div>
          ))}
        </div>

        {/* Work policies */}
        <div className="card">
          <h2 className="card-title">{t("set_policies")}</h2>

          <div className="field">
            <label>{t("pol_daily_hours")}</label>
            <input
              className="input"
              type="number"
              dir="ltr"
              min={1}
              max={24}
              step={0.5}
              value={dailyHours}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  policies: {
                    ...draft.policies,
                    standardDailyMinutes: Math.round(Number(e.target.value) * 60),
                  },
                })
              }
            />
          </div>

          <div className="field">
            <label>{t("pol_weekend")}</label>
            <div className="chip-set">
              {WEEK_DAYS.map((d) => (
                <button
                  type="button"
                  key={d.iso}
                  className={`chip-toggle${weekend.has(d.iso) ? " on" : ""}`}
                  onClick={() => toggleWeekend(d.iso)}
                >
                  {t(d.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t("pol_grace")}</label>
            <input
              className="input"
              type="number"
              dir="ltr"
              min={0}
              max={120}
              value={draft.policies.lateGraceMinutes}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  policies: { ...draft.policies, lateGraceMinutes: Number(e.target.value) },
                })
              }
            />
          </div>

          <div className="switch-row">
            <div className="txt">
              <b>{t("pol_overtime")}</b>
            </div>
            <Switch
              checked={draft.policies.overtimeEnabled}
              onChange={(v) =>
                setDraft({ ...draft, policies: { ...draft.policies, overtimeEnabled: v } })
              }
              label={t("pol_overtime")}
            />
          </div>
        </div>

        {/* Profile */}
        <div className="card">
          <h2 className="card-title">{t("set_profile")}</h2>
          <div className="field">
            <label>{t("pol_currency")}</label>
            <input
              className="input"
              dir="ltr"
              maxLength={3}
              value={draft.profile.currency}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  profile: { ...draft.profile, currency: e.target.value.toUpperCase() },
                })
              }
            />
          </div>
          <div className="field">
            <label>{t("pol_timezone")}</label>
            <input
              className="input"
              dir="ltr"
              value={draft.profile.timezone}
              onChange={(e) =>
                setDraft({ ...draft, profile: { ...draft.profile, timezone: e.target.value } })
              }
            />
          </div>
          <p className="section-hint" style={{ marginTop: 4 }}>
            {t("pol_daily_hours")}: {num(dailyHours)}
          </p>
        </div>
      </div>

      {draft.features.qrKiosk && <KioskDevicesCard />}

      {toast && <Toast message={toast} />}
    </>
  );
}

/** Provision and manage dedicated kiosk device logins (COMPANY_ADMIN/HR_ADMIN). */
function KioskDevicesCard() {
  const { t } = useI18n();
  const can = useHasPermission();
  const canManage = can("employees:write");
  const accounts = useKioskAccounts(true);
  const create = useCreateKioskAccount();
  const reset = useResetKioskAccount();
  const [label, setLabel] = useState("");
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  async function onCreate() {
    if (!label.trim() || create.isPending) return;
    try {
      const acc: KioskAccountCreated = await create.mutateAsync({ label: label.trim() });
      setCreds({ email: acc.email, password: acc.password });
      setLabel("");
      flash(t("kioskdev_created"));
    } catch {
      flash(t("common_error"));
    }
  }

  async function onReset(kioskId: string) {
    try {
      const r = await reset.mutateAsync(kioskId);
      setCreds({ email: "", password: r.password });
      flash(t("kioskdev_reset_done"));
    } catch {
      flash(t("common_error"));
    }
  }

  const rows = accounts.data ?? [];

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 className="card-title">{t("kioskdev_title")}</h2>
      <p className="section-hint">{t("kioskdev_hint")}</p>

      {canManage && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBlockEnd: 14 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder={t("kioskdev_label")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={create.isPending || !label.trim()}
            onClick={() => void onCreate()}
          >
            {t("kioskdev_add")}
          </button>
        </div>
      )}

      {creds && (
        <div className="creds-box">
          <p className="section-hint" style={{ margin: "0 0 10px" }}>
            {t("kioskdev_creds_hint")}
          </p>
          {creds.email && (
            <CredRow label={t("emp_credentials_email")} value={creds.email} onFlash={flash} />
          )}
          <CredRow label={t("emp_credentials_password")} value={creds.password} onFlash={flash} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="section-hint" style={{ marginBlockStart: 8 }}>
          {t("kioskdev_empty")}
        </p>
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "1px solid var(--border)" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("kioskdev_label")}</th>
                <th>{t("emp_credentials_email")}</th>
                <th>{t("emp_status")}</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.kioskId}>
                  <td>{k.label}</td>
                  <td dir="ltr">{k.email}</td>
                  <td>
                    <Chip tone={k.active ? "positive" : "neutral"}>
                      {k.active ? t("status_active") : t("shift_inactive")}
                    </Chip>
                  </td>
                  {canManage && (
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={reset.isPending}
                        onClick={() => void onReset(k.kioskId)}
                      >
                        {t("kioskdev_reset")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function CredRow({
  label,
  value,
  onFlash,
}: {
  label: string;
  value: string;
  onFlash: (m: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="cred-row">
      <span className="cred-label">{label}</span>
      <code className="cred-value" dir="ltr">
        {value}
      </code>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          onFlash(t("emp_credentials_copied"));
        }}
      >
        {t("emp_credentials_copy")}
      </button>
    </div>
  );
}
