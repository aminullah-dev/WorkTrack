import { useState } from "react";
import {
  useCancelCompanyDeletion,
  useCompanyDeletion,
  useRequestCompanyDeletion,
} from "../api/hooks";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { toShamsi } from "../shamsi/solarHijri";
import { ErrorState, LoadingState, Toast } from "../ui/components";

const SHAMSI_MONTHS = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

/**
 * Closing the company account.
 *
 * Deliberately the least convenient thing on the page: it asks for the company
 * name in full, states plainly what is destroyed and when, and stays reversible
 * for the whole grace period. The scheduled state is shown first and loudly,
 * because an account quietly counting down to deletion is the one thing here
 * nobody should be able to miss.
 */
export function DangerZoneCard() {
  const { t, num } = useI18n();
  const { me } = useAuth();
  const can = useHasPermission();
  const canDelete = can("company:delete");

  const deletion = useCompanyDeletion(canDelete);
  const request = useRequestCompanyDeletion();
  const cancel = useCancelCompanyDeletion();

  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Only a company admin sees this at all.
  if (!canDelete) return null;

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3000);
  };

  const companyName = me?.companyName ?? "";
  const nameMatches = confirmName.trim() === companyName.trim();

  function shamsiLabel(iso: string): string {
    const s = toShamsi(iso);
    return `${num(s.day)} ${SHAMSI_MONTHS[s.month - 1]} ${num(s.year)}`;
  }

  async function onRequest() {
    try {
      await request.mutateAsync({ confirmName: confirmName.trim(), reason: reason.trim() || null });
      setOpen(false);
      setConfirmName("");
      setReason("");
      flash(t("dz_scheduled"));
    } catch {
      flash(t("common_error"));
    }
  }

  async function onCancel() {
    try {
      await cancel.mutateAsync();
      flash(t("dz_cancelled"));
    } catch {
      flash(t("common_error"));
    }
  }

  const scheduled = deletion.data?.status === "SCHEDULED";

  return (
    <div className="card danger-card" style={{ marginTop: 18 }}>
      <h2 className="card-title">{t("dz_title")}</h2>

      {deletion.isLoading ? (
        <LoadingState />
      ) : deletion.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void deletion.refetch()} />
      ) : scheduled ? (
        <>
          <div className="danger-banner">
            <b>{t("dz_scheduled_title")}</b>
            <p>
              {t(
                "dz_scheduled_body",
                deletion.data?.purgeAfter ? shamsiLabel(deletion.data.purgeAfter) : "—",
              )}
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginBlockStart: 14 }}
            disabled={cancel.isPending}
            onClick={() => void onCancel()}
          >
            {cancel.isPending ? t("common_saving") : t("dz_cancel")}
          </button>
        </>
      ) : (
        <>
          <p className="section-hint">
            {t("dz_hint", num(deletion.data?.graceDays ?? 30))}
          </p>

          {!open ? (
            <button className="btn btn-danger" onClick={() => setOpen(true)}>
              {t("dz_start")}
            </button>
          ) : (
            <div className="danger-confirm">
              <p>{t("dz_confirm_body")}</p>
              <ul>
                <li>{t("dz_loses_attendance")}</li>
                <li>{t("dz_loses_payroll")}</li>
                <li>{t("dz_loses_logins")}</li>
              </ul>

              <label className="field">
                <span className="label">{t("dz_type_name", companyName)}</span>
                <input
                  className="input"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={companyName}
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span className="label">{t("dz_reason")}</span>
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("dz_reason_ph")}
                />
              </label>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn btn-danger"
                  disabled={!nameMatches || request.isPending}
                  onClick={() => void onRequest()}
                >
                  {request.isPending ? t("common_saving") : t("dz_confirm")}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setOpen(false);
                    setConfirmName("");
                  }}
                >
                  {t("common_cancel")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}
