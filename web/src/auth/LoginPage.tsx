import { useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { NoManagerAccessError, useAuth } from "./AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";

export function LoginPage() {
  const { signIn } = useAuth();
  const { t, locale, setLocale } = useI18n();
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
      await signIn(email, password);
    } catch (err) {
      if (err instanceof NoManagerAccessError) {
        setError(t("login_no_access"));
      } else if (err instanceof FirebaseError) {
        setError(t("login_error"));
      } else {
        setError(t("common_error"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">WorkTrack</div>
        <div className="tagline">{t("tagline")}</div>

        <div className="field">
          <label htmlFor="email">{t("login_email")}</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t("login_password")}</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? t("login_signing_in") : t("login_submit")}
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
