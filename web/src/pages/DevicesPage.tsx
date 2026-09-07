import { useEffect, useState } from "react";
import { useDevices, useLicense, useSetDeviceStatus } from "../api/hooks";
import { useHasPermission } from "../auth/AuthProvider";
import type { License, LicensedDevice } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

/**
 * Device licensing: how many phones and kiosks may run against this company,
 * which ones currently hold a seat, and revoking the ones that should not.
 */
export function DevicesPage() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const canRead = can("devices:read");
  // Revoking a device is legitimate self-service; the licence itself is not.
  const canManage = can("devices:manage");

  const license = useLicense(canRead);
  const devices = useDevices(canRead);
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
            <dl className="license-facts">
              <div>
                <dt>{t("dev_plan")}</dt>
                <dd>{t(`dev_plan_${draft.plan.toLowerCase()}`)}</dd>
              </div>
              <div>
                <dt>{t("dev_limit")}</dt>
                <dd dir="ltr">{num(draft.deviceLimit)}</dd>
              </div>
              <div>
                <dt>{t("dev_status")}</dt>
                <dd>{t(`dev_status_${draft.status.toLowerCase()}`)}</dd>
              </div>
              <div>
                <dt>{t("dev_expires")}</dt>
                <dd dir={draft.expiresAt ? "ltr" : undefined}>
                  {draft.expiresAt ?? t("dev_expires_never")}
                </dd>
              </div>
              <div>
                <dt>{t("dev_enforce")}</dt>
                <dd>{draft.enforceDevices ? t("common_yes") : t("common_no")}</dd>
              </div>
            </dl>

            <p className="hint" style={{ marginTop: 12 }}>
              {t("dev_license_vendor_hint")}
            </p>
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
