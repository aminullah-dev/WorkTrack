import { useState } from "react";
import { useRaiseSupportTicket, useSupportTickets } from "../api/hooks";
import { Chip, LoadingState } from "../ui/components";
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

      <RaiseIssue />

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

/**
 * Raising an issue without leaving the product.
 *
 * The company, plan and seat count travel with it, so the answer does not begin
 * with three questions the customer has already been asked once.
 */
function RaiseIssue() {
  const { t } = useI18n();
  const tickets = useSupportTickets();
  const raise = useRaiseSupportTicket();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!subject.trim()) return;
    try {
      await raise.mutateAsync({ subject: subject.trim(), detail: detail.trim() || undefined });
      setSubject("");
      setDetail("");
      setOpen(false);
      setSent(true);
      window.setTimeout(() => setSent(false), 5000);
    } catch {
      setError(t("sup_issue_failed"));
    }
  }

  const rows = tickets.data ?? [];

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <div className="card-head">
        <div>
          <span className="label">{t("sup_issues")}</span>
          <p className="hint" style={{ marginTop: 2 }}>{t("sup_issues_hint")}</p>
        </div>
        {!open && (
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            {t("sup_raise")}
          </button>
        )}
      </div>

      {sent && <p className="notice-ok">{t("sup_issue_sent")}</p>}

      {open && (
        <div className="comp-form">
          <div className="field">
            <label className="label" htmlFor="sup-subject">{t("sup_subject")}</label>
            <input
              id="sup-subject"
              className="input"
              placeholder={t("sup_subject_ph")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label className="label" htmlFor="sup-detail">{t("sup_detail")}</label>
            <textarea
              id="sup-detail"
              className="input"
              rows={3}
              placeholder={t("sup_detail_ph")}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              className="btn btn-primary"
              disabled={!subject.trim() || raise.isPending}
              onClick={() => void submit()}
            >
              {raise.isPending ? t("common_saving") : t("sup_send")}
            </button>
            <button className="btn btn-outline" onClick={() => setOpen(false)}>
              {t("common_cancel")}
            </button>
          </div>
        </div>
      )}

      {tickets.isLoading ? (
        <LoadingState />
      ) : rows.length > 0 ? (
        <ul className="empc-list" style={{ marginTop: 12 }}>
          {rows.map((r) => (
            <li key={r.id} className="empc-row">
              <div className="empc-name">
                <div>{r.subject}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {r.openedAt}
                  {r.resolvedAt && ` — ${r.resolvedAt}`}
                </div>
              </div>
              <Chip tone={r.status === "RESOLVED" ? "positive" : "warning"}>
                {t(`sup_status_${r.status.toLowerCase()}`)}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
