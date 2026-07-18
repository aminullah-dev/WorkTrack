import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Public web config — safe to ship in the client bundle. Access control is
// enforced by the API (bearer token + RBAC), not by hiding these values.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * True only when the Firebase web config is filled in (.env.local). When false
 * the app renders a setup screen instead of initializing Firebase — otherwise
 * getAuth() throws on an empty apiKey and the whole page white-screens.
 */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

// A stub is fine when unconfigured: the auth-dependent tree is never mounted
// in that case (see main.tsx), so `auth` is never actually touched.
export const auth: Auth = firebaseConfigured
  ? getAuth(initializeApp(config))
  : ({} as Auth);
