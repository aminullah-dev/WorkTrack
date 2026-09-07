import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";

/**
 * Who to contact, and the one identifier they will ask for.
 *
 * A company that has bought WorkTrack otherwise has no way of reaching the
 * people they bought it from without leaving the product. The company id
 * matters as much as the phone number: it is what a licence is issued against,
 * so every support conversation about seats or renewal starts by asking for it.
 */
export function SupportCard() {
  const { t } = useI18n();
  const { me } = useAuth();
  const [copied, setCopied] = useState(false);

  async function copyId() {
    if (!me?.companyId) return;
    try {
      await navigator.clipboard.writeText(me.companyId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some browsers; the id is on screen to read.
      setCopied(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{t("sup_title")}</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {t("sup_intro")}
      </p>

      <dl className="license-facts" style={{ marginTop: 14 }}>
        <div>
          <dt>{t("sup_phone")}</dt>
          <dd dir="ltr">
            <a href="tel:+93793817977">+93 793 817 977</a>
          </dd>
        </div>
        <div>
          <dt>{t("sup_email")}</dt>
          <dd dir="ltr">
            <a href="mailto:contact@linumic.com">contact@linumic.com</a>
          </dd>
        </div>
        <div>
          <dt>{t("sup_web")}</dt>
          <dd dir="ltr">
            <a href="https://linumic.com" target="_blank" rel="noreferrer">
              linumic.com
            </a>
          </dd>
        </div>
      </dl>

      <div style={{ marginTop: 18 }}>
        <span className="label">{t("sup_company_id")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
          <code dir="ltr" className="company-id">
            {me?.companyId ?? "—"}
          </code>
          <button className="btn btn-outline btn-sm" onClick={() => void copyId()}>
            {copied ? t("sup_copied") : t("sup_copy")}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {t("sup_company_id_hint")}
        </p>
      </div>
    </div>
  );
}
