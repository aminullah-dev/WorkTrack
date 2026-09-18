import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DICTIONARIES, type Locale } from "./strings";

/**
 * Every key the portal asks for exists, in every language.
 *
 * `t()` falls back to returning the key itself, so a missing string is not an
 * error — it is the literal text `common_close` sitting on a button, shipped,
 * with every test green. Two of those went out this week and both were caught
 * by a person looking at the screen, which is not a system.
 *
 * The iOS app has had ios/check-strings.py doing this since it was built. This
 * is the same audit for the portal, as a test so it runs on every change.
 */

// Resolved from the project root rather than from import.meta.url: vitest
// rewrites module URLs, and the relative form resolved to "/src".
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Literal `t("…")` calls only.
 *
 * Keys built at runtime — t(`role_${r.toLowerCase()}`) — cannot be checked this
 * way and are covered by the tests that render those lists. Matching them
 * loosely here would produce false failures and get the audit switched off,
 * which is worse than the gap.
 */
function keysIn(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

const LANGUAGES: Locale[] = ["fa", "ps", "en"];

describe("translation keys", () => {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    for (const key of keysIn(readFileSync(file, "utf8"))) {
      used.set(key, [...(used.get(key) ?? []), file.replace(SRC, "")]);
    }
  }

  it("finds a meaningful number of them, or the scanner is broken", () => {
    // A regex that silently matched nothing would make every assertion below
    // pass while checking not one thing.
    expect(used.size).toBeGreaterThan(200);
  });

  it("has every used key in all three dictionaries", () => {
    const missing: string[] = [];
    for (const [key, files] of used) {
      for (const lang of LANGUAGES) {
        const value = (DICTIONARIES[lang] as Record<string, string>)[key];
        if (!value) missing.push(`${lang}: ${key}  (${files[0]})`);
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("never uses the key itself as the translation", () => {
    // Filling a gap with the key silences this audit while leaving the same
    // text on screen.
    const lazy: string[] = [];
    for (const lang of LANGUAGES) {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        if (value === key) lazy.push(`${lang}: ${key}`);
      }
    }
    expect(lazy).toEqual([]);
  });
});
