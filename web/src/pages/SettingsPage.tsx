import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "../api/hooks";
import type { CompanyFeatures, CompanySettings } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { ErrorState, LoadingState, Switch, Toast } from "../ui/components";

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

      {toast && <Toast message={toast} />}
    </>
  );
}
