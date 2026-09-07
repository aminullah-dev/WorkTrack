import { describe, it, expect } from "vitest";
import { allowedOrigins, isOriginAllowed } from "./cors";

/**
 * The API ran with `cors({ origin: true })`, which reflects whatever Origin the
 * caller sends. Any page on any domain could therefore call the API from a
 * signed-in manager's browser and read the response.
 */

const PROD: NodeJS.ProcessEnv = {};
const EMULATOR: NodeJS.ProcessEnv = { FUNCTIONS_EMULATOR: "true" };

describe("CORS origin policy", () => {
  it("allows the portal's own Hosting origins", () => {
    expect(isOriginAllowed("https://worktrack-prod.web.app", PROD)).toBe(true);
    expect(isOriginAllowed("https://worktrack-prod.firebaseapp.com", PROD)).toBe(true);
  });

  it("refuses an origin that is not on the list", () => {
    expect(isOriginAllowed("https://evil.example", PROD)).toBe(false);
  });

  it("refuses a look-alike of an allowed origin", () => {
    expect(isOriginAllowed("https://worktrack-prod.web.app.evil.example", PROD)).toBe(false);
    expect(isOriginAllowed("http://worktrack-prod.web.app", PROD)).toBe(false); // not https
  });

  it("allows a request with no Origin header", () => {
    // The Android app uses OkHttp, which sends no Origin. CORS is a browser
    // mechanism; these callers still have to pass Firebase Auth.
    expect(isOriginAllowed(undefined, PROD)).toBe(true);
  });

  it("does not allow the dev server in production", () => {
    expect(isOriginAllowed("http://localhost:5173", PROD)).toBe(false);
  });

  it("allows the dev server only when running against the emulator", () => {
    expect(isOriginAllowed("http://localhost:5173", EMULATOR)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173", EMULATOR)).toBe(true);
  });

  it("takes extra origins from CORS_ORIGINS so a custom domain needs no code change", () => {
    const env = { CORS_ORIGINS: "https://worktrack.af, https://app.worktrack.af" };
    expect(isOriginAllowed("https://worktrack.af", env)).toBe(true);
    expect(isOriginAllowed("https://app.worktrack.af", env)).toBe(true);
    expect(isOriginAllowed("https://other.af", env)).toBe(false);
  });

  it("ignores blank entries in CORS_ORIGINS", () => {
    // A trailing comma must not turn into an empty allowed origin.
    expect(allowedOrigins({ CORS_ORIGINS: "https://worktrack.af,," })).not.toContain("");
  });
});
