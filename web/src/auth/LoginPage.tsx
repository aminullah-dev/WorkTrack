import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import {
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { NoManagerAccessError, useAuth } from "./AuthProvider";
import { ApiError, signupCompany } from "../api/client";
import { BUSINESS_TYPES } from "../api/businessTypes";
import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";
import { ThemeToggle } from "../ui/ThemeProvider";

type Mode = "login" | "signup";

export function LoginPage() {
  const { signIn } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [mode, setMode] = useState<Mode>("login");

  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a signup (or a login by an unverified admin) is waiting on the
  // verification link; swaps the form for the "check your inbox" panel.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  /**
   * Signs in far enough for Firebase to send its own verification mail, then
   * signs straight back out. The backend refuses an unverified self-signup
   * admin, so there is no session to keep — and Firebase sends the message
   * itself, which is why no mail transport is configured anywhere.
   */
  async function sendVerification(address: string, secret: string): Promise<void> {
    const cred = await signInWithEmailAndPassword(auth, address, secret);
    await sendEmailVerification(cred.user);
    await firebaseSignOut(auth);
  }

  async function onResend() {
    if (busy || !pendingEmail) return;
    setBusy(true);
    setError(null);
    try {
      await sendVerification(pendingEmail, password);
      setResent(true);
    } catch {
      setError(t("common_error"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        // Create the company + admin, then have Firebase mail the verification
        // link. The admin cannot be signed in yet: the API gates a self-signup
        // account until the address is proven.
        await signupCompany({
          companyName,
          // Empty means "did not say", which the server reads as the product
          // defaults rather than as an error.
          businessType: businessType || undefined,
          adminFirstName: firstName,
          adminLastName: lastName,
          email,
          password,
        });
        await sendVerification(email.trim(), password);
        setPendingEmail(email.trim());
        return;
      }
      await signIn(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        // Signed in to Firebase but refused by the API. Drop the session and
        // point them at the link rather than showing a bare error.
        await firebaseSignOut(auth).catch(() => undefined);
        setPendingEmail(email.trim());
      } else if (err instanceof NoManagerAccessError) setError(t("login_no_access"));
      else if (err instanceof ApiError)
        setError(err.code === "CONFLICT" ? t("signup_email_exists") : err.message);
      else if (err instanceof FirebaseError) setError(t("login_error"));
      else setError(t("common_error"));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="auth">
      <div className="auth-toolbar">
        <ThemeToggle />
      </div>
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand">
            <span className="brand-mark">W</span> WorkTrack
          </div>
          <p className="auth-hero-tag">{t("tagline")}</p>
          <ul className="auth-points">
            <li>
              <span className="tick">✓</span> {t("auth_point_1")}
            </li>
            <li>
              <span className="tick">✓</span> {t("auth_point_2")}
            </li>
            <li>
              <span className="tick">✓</span> {t("auth_point_3")}
            </li>
          </ul>
        </div>
      </aside>

      <div className="auth-main">
        <form className="auth-form" onSubmit={onSubmit}>
          {pendingEmail ? (
            <>
              <h1>{t("verify_title")}</h1>
              <div className="sub">{t("verify_sent", pendingEmail)}</div>
              <p className="sub" style={{ marginBottom: 16 }}>{t("verify_hint")}</p>

              {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}
              {resent && <div className="sub" style={{ marginBottom: 12 }}>{t("verify_resent")}</div>}

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%" }}
                disabled={busy}
                onClick={onResend}
              >
                {t("verify_resend")}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ width: "100%", marginTop: 12 }}
                onClick={() => {
                  setPendingEmail(null);
                  setResent(false);
                  setError(null);
                  setMode("login");
                }}
              >
                {t("verify_back")}
              </button>
            </>
          ) : (
            <>
          <h1>{isSignup ? t("signup_title") : t("login_welcome")}</h1>
          <div className="sub">{isSignup ? t("signup_sub") : t("tagline")}</div>

          {isSignup && (
          <>
            <Field label={t("signup_company")} value={companyName} onChange={setCompanyName} required />
            {/* One question, asked once. It only chooses starting values —
                every one of them is on the settings page afterwards, and this
                answer can be changed there too. */}
            <div className="field">
              <label>{t("signup_business_type")}</label>
              <select
                className="select"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
              >
                <option value="">{t("signup_business_type_skip")}</option>
                {BUSINESS_TYPES.map((id) => (
                  <option key={id} value={id}>
                    {t(`biz_${id.toLowerCase()}`)}
                  </option>
                ))}
              </select>
              <span className="sub" style={{ fontSize: ".85em" }}>
                {t("signup_business_type_hint")}
              </span>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label={t("signup_admin_first")} value={firstName} onChange={setFirstName} required />
              <Field label={t("signup_admin_last")} value={lastName} onChange={setLastName} required />
            </div>
          </>
        )}

        <Field
          label={t("login_email")}
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="username"
          dir="ltr"
          required
        />
        <Field
          label={t("login_password")}
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          hint={isSignup ? t("signup_password_hint") : undefined}
          required
        />

        {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy
            ? isSignup
              ? t("signup_creating")
              : t("login_signing_in")
            : isSignup
              ? t("signup_submit")
              : t("login_submit")}
        </button>

        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => {
            setError(null);
            setMode(isSignup ? "login" : "signup");
          }}
        >
            {isSignup ? t("signup_have_account") : t("signup_no_account")}
          </button>
            </>
          )}

          <div className="lang-switch" style={{ marginTop: 20 }}>
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                className={l.code === locale ? "active" : ""}
                onClick={() => setLocale(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  dir,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  dir?: "ltr" | "rtl";
  hint?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && show ? "text" : type;

  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          type={inputType}
          dir={dir}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          style={isPassword ? { paddingInlineEnd: 44 } : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? t("login_hide_password") : t("login_show_password")}
            title={show ? t("login_hide_password") : t("login_show_password")}
          >
            {show ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
      {hint && <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{hint}</span>}
    </div>
  );
}

const IconEye = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);
