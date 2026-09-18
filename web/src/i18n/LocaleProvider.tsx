import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTIONARIES, LOCALES, type Locale } from "./strings";
import { toShamsi, type ShamsiDate } from "../shamsi/solarHijri";

const SHAMSI_MONTHS: Record<Locale, string[]> = {
  fa: ["حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله", "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت"],
  ps: ["وری", "غویی", "غبرګولی", "چنګاښ", "زمری", "وږی", "تله", "لړم", "لیندۍ", "مرغومی", "سلواغه", "کب"],
  en: ["Hamal", "Sawr", "Jawza", "Saratan", "Asad", "Sunbula", "Mizan", "Aqrab", "Qaws", "Jadi", "Dalw", "Hut"],
};

const EASTERN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

interface LocaleContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  setLocale: (locale: Locale) => void;
  /** Translate a key, with optional {0},{1} interpolation. */
  t: (key: string, ...args: (string | number)[]) => string;
  /** Localize Latin digits to ۰–۹ for fa/ps. */
  num: (value: string | number) => string;
  /** Format an ISO date as a Solar Hijri string, e.g. "۲۶ سرطان ۱۴۰۵". */
  shamsi: (isoDate: string, opts?: { withYear?: boolean }) => string;
  shamsiMonthName: (month: number) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "worktrack.locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    return stored && LOCALES.some((l) => l.code === stored) ? stored : "fa";
  });

  const dir = LOCALES.find((l) => l.code === locale)?.dir ?? "rtl";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const num = useCallback(
    (value: string | number): string => {
      const s = String(value);
      if (locale === "en") return s;
      return s.replace(/[0-9]/g, (d) => EASTERN_DIGITS[Number(d)]);
    },
    [locale],
  );

  const shamsiMonthName = useCallback(
    (month: number): string => SHAMSI_MONTHS[locale][Math.min(Math.max(month - 1, 0), 11)],
    [locale],
  );

  const value = useMemo<LocaleContextValue>(() => {
    const dict = DICTIONARIES[locale];
    const t = (key: string, ...args: (string | number)[]): string => {
      let text = dict[key] ?? key;
      args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, String(arg));
      });
      return text;
    };
    const shamsi = (isoDate: string, opts?: { withYear?: boolean }): string => {
      const d: ShamsiDate = toShamsi(isoDate);
      const base = `${d.day} ${SHAMSI_MONTHS[locale][d.month - 1]}${
        opts?.withYear ? ` ${d.year}` : ""
      }`;
      return locale === "en" ? base : base.replace(/[0-9]/g, (n) => EASTERN_DIGITS[Number(n)]);
    };
    return { locale, dir, setLocale, t, num, shamsi, shamsiMonthName };
  }, [locale, dir, setLocale, num, shamsiMonthName]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}
