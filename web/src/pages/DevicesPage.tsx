import { useEffect, useState } from "react";
import { useDevices, useLicense, useSaveLicense, useSetDeviceStatus } from "../api/hooks";
import { useHasPermission } from "../auth/AuthProvider";
import type { License, LicensedDevice } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Switch, Toast } from "../ui/components";

/**
 * Device licensing: how many phones and kiosks may run against this company,
 * which ones currently hold a seat, and revoking the ones that should not.
 */
export function DevicesPage() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const canRead = can("devices:read");
  const canManage = can("devices:manage");

  const license = useLicense(canRead);
  const devices = useDevices(canRead);
  const saveLicense = useSaveLicense();
  const setStatus = useSetDeviceStatus();

  const [draft, setDraft] = useState<License | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Seed the editable copy once the licence arrives, and whenever it changes
  // underneath us — but never while the administrator is mid-edit.
  useEffect(() => {
    if (license.data && draft === null) setDraft(license.data);
  }, [license.data, draft]);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  if (!canRead) return <EmptyState message={t("dev_no_access")} />;

  const rows = devices.data ?? [];
  const inUse = rows.filter((d) => d.status === "ACTIVE").length;
  const limit = license.data?.deviceLimit ?? 0;
  const full = limit > 0 && inUse >= limit;

  async function onSave() {
    if (!draft) return;
    try {
      await saveLicense.mutateAsync(draft);
      flash(t("dev_saved"));
    } catch {
      flash(t("common_error"));
    }
  }

  async function onToggleDevice(device: LicensedDevice) {
    try {
      await setStatus.mutateAsync({
        deviceId: device.deviceId,
        action: device.status === "ACTIVE" ? "revoke" : "restore",
      });
      flash(t("dev_saved"));
    } catch {
      flash(t("common_error"));
    }
  }

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("dev_title")}</h1>
        <Chip tone={full ? "warning" : "positive"}>
          {t("dev_seats_used", num(inUse), num(limit))}
        </Chip>
      </div>

      {/* Licence */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{t("dev_license")}</h2>

        {license.isLoading ? (
          <LoadingState />
        ) : license.isError || !draft ? (
          <ErrorState message={t("common_error")} onRetry={() => void license.refetch()} />
        ) : (
          <>
            <div className="form-row">
              <label className="field">
                <span className="label">{t("dev_plan")}</span>
                <select
                  value={draft.plan}
                  disabled={!canManage}
                  onChange={(e) => setDraft({ ...draft, plan: e.target.value as License["plan"] })}
                >
                  <option value="FREE">{t("dev_plan_free")}</option>
                  <option value="STANDARD">{t("dev_plan_standard")}</option>
                  <option value="ENTERPRISE">{t("dev_plan_enterprise")}</option>
                </select>
              </label>

              <label className="field">
                <span className="label">{t("dev_limit")}</span>
                <input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={draft.deviceLimit}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDraft({ ...draft, deviceLimit: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </label>

              <label className="field">
                <span className="label">{t("dev_status")}</span>
                <select
                  value={draft.status}
                  disabled={!canManage}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as License["status"] })
                  }
                >
                  <option value="ACTIVE">{t("dev_status_active")}</option>
                  <option value="SUSPENDED">{t("dev_status_suspended")}</option>
                  <option value="EXPIRED">{t("dev_status_expired")}</option>
                </select>
              </label>

              <label className="field">
                <span className="label">{t("dev_expires")}</span>
                <input
                  type="date"
                  dir="ltr"
                  value={draft.expiresAt ?? ""}
                  disabled={!canManage}
                  onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value || null })}
                />
                <span className="hint">{t("dev_expires_hint")}</span>
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Switch
                  checked={draft.enforceDevices}
                  disabled={!canManage}
                  onChange={(v) => setDraft({ ...draft, enforceDevices: v })}
                  label={t("dev_enforce")}
                />
                <span>{t("dev_enforce")}</span>
              </label>
              <p className="hint" style={{ marginTop: 6 }}>
                {t("dev_enforce_hint")}
              </p>
            </div>

            {canManage && (
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                disabled={saveLicense.isPending}
                onClick={() => void onSave()}
              >
                {saveLicense.isPending ? t("common_saving") : t("common_save")}
              </button>
            )}
          </>
        )}
      </div>

      {/* Devices */}
      <div className="card" style={{ padding: 0 }}>
        <h2 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>{t("dev_registered")}</h2>

        {devices.isLoading ? (
          <LoadingState />
        ) : devices.isError ? (
          <ErrorState message={t("common_error")} onRetry={() => void devices.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message={t("dev_empty")} />
        ) : (
          <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("dev_device")}</th>
                  <th>{t("dev_type")}</th>
                  <th>{t("dev_employee")}</th>
                  <th>{t("dev_last_seen")}</th>
                  <th>{t("dev_status")}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.deviceId}>
                    <td>
                      <div>{d.label ?? d.model ?? t("dev_unnamed")}</div>
                      <div className="muted" dir="ltr" style={{ fontSize: 12 }}>
                        {d.deviceId}
                      </div>
                    </td>
                    <td>
                      {d.type === "KIOSK" ? t("dev_type_kiosk") : t("dev_type_mobile")}
                      {d.appVersion && (
                        <div className="muted" dir="ltr" style={{ fontSize: 12 }}>
                          v{d.appVersion}
                        </div>
                      )}
                    </td>
                    <td dir="ltr">{d.employeeId ?? "—"}</td>
                    <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—"}</td>
                    <td>
                      <Chip tone={d.status === "ACTIVE" ? "positive" : "neutral"}>
                        {d.status === "ACTIVE" ? t("dev_status_active") : t("dev_revoked")}
                      </Chip>
                    </td>
                    {canManage && (
                      <td style={{ textAlign: "end" }}>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={setStatus.isPending}
                          onClick={() => void onToggleDevice(d)}
                        >
                          {d.status === "ACTIVE" ? t("dev_revoke") : t("dev_restore")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </>
  );
}
