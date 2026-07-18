import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { NoManagerAccessError, useAuth } from "./AuthProvider";
import { ApiError, signupCompany } from "../api/client";
import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";

type Mode = "login" | "signup";

export function LoginPage() {
  const { signIn } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [mode, setMode] = useState<Mode>("login");

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        // Create the company + admin, then sign that admin straight in.
        await signupCompany({
          companyName,
          adminFirstName: firstName,
          adminLastName: lastName,
          email,
          password,
        });
      }
      await signIn(email, password);
    } catch (err) {
      if (err instanceof NoManagerAccessError) setError(t("login_no_access"));
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
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">WorkTrack</div>
        <div className="tagline">{isSignup ? t("signup_title") : t("tagline")}</div>

        {isSignup && (
          <>
            <Field label={t("signup_company")} value={companyName} onChange={setCompanyName} required />
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
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      <input
        className="input"
        type={type}
        dir={dir}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {hint && <span style={{ fontSize: 12, color: "var(--slate-50)" }}>{hint}</span>}
    </div>
  );
}
