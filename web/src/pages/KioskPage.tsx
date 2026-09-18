import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { useKioskToken } from "../api/hooks";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";

/**
 * Full-screen kiosk mode for a shared entrance tablet. Shows a QR that rotates
 * every 30s (minted server-side); employees scan it in the app to punch. No
 * chrome — it's meant to run unattended on a wall-mounted screen.
 */
export function KioskPage() {
  const { t, num } = useI18n();
  const { me, status, signOut } = useAuth();
  const navigate = useNavigate();
  const kiosk = useKioskToken(me?.branchIds[0]);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const hh = String(clock.getHours()).padStart(2, "0");
  const mm = String(clock.getMinutes()).padStart(2, "0");
  // Device account → sign out (unlock the tablet); manager preview → back to portal.
  const isDevice = status === "kiosk";
  const onExit = () => (isDevice ? void signOut() : navigate("/"));
  const companyName = kiosk.data?.companyName || me?.companyName || "WorkTrack";

  return (
    <div className="kiosk">
      <button
        className="kiosk-exit"
        onClick={onExit}
        aria-label={isDevice ? t("nav_logout") : t("kiosk_exit")}
      >
        ✕
      </button>

      <div className="kiosk-brand">
        <span className="brand-mark">W</span>
        <span>{companyName}</span>
      </div>

      <div className="kiosk-clock" dir="ltr">
        {num(`${hh}:${mm}`)}
      </div>

      <div className="kiosk-qr">
        {kiosk.data ? (
          <Qr value={kiosk.data.token} />
        ) : kiosk.isError ? (
          <div className="kiosk-error">{t("common_error")}</div>
        ) : (
          <div className="spinner" />
        )}
      </div>

      <h1 className="kiosk-title">{t("kiosk_title")}</h1>
      <p className="kiosk-hint">{t("kiosk_hint")}</p>
      <p className="kiosk-rotate">{t("kiosk_rotates")}</p>
    </div>
  );
}

/** Renders a QR for [value] as an inline SVG (regenerated whenever it changes). */
function Qr({ value }: { value: string }) {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() => {
        if (alive) setSvg("");
      });
    return () => {
      alive = false;
    };
  }, [value]);

  return <div className="qr-svg" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}
