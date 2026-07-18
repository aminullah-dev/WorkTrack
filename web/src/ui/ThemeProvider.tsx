import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "../i18n/LocaleProvider";

type Mode = "light" | "dark" | "system";
type Theme = "light" | "dark";

const STORAGE_KEY = "worktrack.theme";

interface ThemeContextValue {
  /** The resolved theme actually shown (system → concrete). */
  theme: Theme;
  /** The user's stored preference. */
  mode: Mode;
  toggle: () => void;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: Mode): Theme {
  return mode === "system" ? (systemDark() ? "dark" : "light") : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });
  const [theme, setTheme] = useState<Theme>(() => resolve(mode));

  // Reflect the resolved theme on <html> so the CSS token overrides apply.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // In "system" mode, track the OS preference live.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(systemDark() ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = useCallback((next: Mode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
    setTheme(resolve(next));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      setMode,
      toggle: () => setMode(theme === "dark" ? "light" : "dark"),
    }),
    [theme, mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Sun/moon icon button that flips light ⇄ dark. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = theme === "dark" ? t("theme_to_light") : t("theme_to_dark");
  return (
    <button className="icon-btn" onClick={toggle} title={label} aria-label={label}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
  </svg>
);
