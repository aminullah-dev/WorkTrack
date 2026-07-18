import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";

/**
 * Shown when the Firebase web config is missing from .env.local. Prevents the
 * white-screen you get from initializing Firebase Auth with an empty apiKey,
 * and tells the operator exactly what to fill in.
 */
export function SetupNeeded() {
  const { locale, setLocale } = useI18n();
  const en = locale === "en";

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460, textAlign: "start" }}>
        <div className="brand" style={{ textAlign: "center" }}>
          WorkTrack
        </div>
        <p style={{ color: "var(--slate-50)", textAlign: "center", marginBottom: 20 }}>
          {en
            ? "Firebase is not configured yet"
            : "تنظیمات Firebase هنوز کامل نیست"}
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          {en ? (
            <>
              Create <code>web/.env.local</code> and fill in your Firebase web app
              config (Firebase console → Project settings → Your apps → Web), then
              restart the dev server:
            </>
          ) : (
            <>
              فایل <code>web/.env.local</code> را بسازید و تنظیمات Firebase خود را
              پر کنید (از Firebase console → Project settings → Your apps → Web)،
              بعد سرور را دوباره اجرا کنید:
            </>
          )}
        </p>
        <pre
          dir="ltr"
          style={{
            background: "var(--slate-95)",
            padding: 14,
            borderRadius: 8,
            fontSize: 12.5,
            overflow: "auto",
          }}
        >
{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE_URL=http://127.0.0.1:5001/<project-id>/us-central1/api/v1`}
        </pre>
        <div className="lang-switch" style={{ marginTop: 8, justifyContent: "center" }}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              className={l.code === locale ? "active" : ""}
              onClick={() => setLocale(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
