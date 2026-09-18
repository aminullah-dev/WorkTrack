/**
 * Which browser origins may call the API.
 *
 * In production almost nothing needs this. Firebase Hosting serves the manager
 * portal and rewrites /v1/** to this function, so the portal's calls are
 * same-origin; and the Android app is not a browser, so CORS never applies to
 * it. The allow-list therefore covers the exceptions: a portal loaded from a
 * Hosting domain that calls an absolute API URL, a custom domain, and the Vite
 * dev server.
 *
 * `origin: true` reflected whatever Origin the caller sent, which let a page on
 * any domain read authenticated responses from a signed-in manager's browser.
 */

/** Firebase Hosting serves the portal on both of these by default. */
const HOSTING_ORIGINS = [
  "https://worktrack-prod.web.app",
  "https://worktrack-prod.firebaseapp.com",
];

/** Vite dev server — allowed only when running against the local emulator. */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/**
 * Additional origins come from CORS_ORIGINS (comma-separated), so connecting a
 * custom domain in Hosting is a config change rather than a code change. Set it
 * in backend/functions/.env, which the Functions runtime loads on deploy:
 *   CORS_ORIGINS=https://worktrack.af,https://app.worktrack.af
 */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // FUNCTIONS_EMULATOR is set by the Firebase emulator and never in production.
  const dev = env.FUNCTIONS_EMULATOR === "true" ? DEV_ORIGINS : [];
  return [...HOSTING_ORIGINS, ...extra, ...dev];
}

export function isOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // No Origin header means the caller is not a browser: the Android app (OkHttp
  // sends none), curl, or a server-to-server call. CORS is a browser mechanism,
  // so refusing these would break the mobile app without protecting anything —
  // the request still has to pass Firebase Auth and RBAC either way.
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}
