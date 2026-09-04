import { describe, it, expect, vi } from "vitest";
import { render, screen, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { LocaleProvider, useI18n } from "./LocaleProvider";

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe("LocaleProvider defaults", () => {
  it("defaults to Dari (fa) with RTL direction", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("fa");
    expect(result.current.dir).toBe("rtl");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("fa");
  });

  it("restores a persisted locale from localStorage", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en");
    expect(result.current.dir).toBe("ltr");
  });

  it("ignores an invalid persisted locale and falls back to fa", () => {
    localStorage.setItem("worktrack.locale", "de");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("fa");
  });
});

describe("t (translation + interpolation)", () => {
  it("translates a key in the active locale", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("nav_dashboard")).toBe("Dashboard");
  });

  it("interpolates positional {0} placeholders", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("pay_run_done", 5)).toBe("Payroll calculated for 5 employees");
  });

  it("returns the key itself when no translation exists", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("totally_missing_key")).toBe("totally_missing_key");
  });
});

describe("num (digit localization)", () => {
  it("converts Latin digits to Eastern Arabic digits for fa", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.num(2026)).toBe("۲۰۲۶");
  });

  it("leaves digits untouched for en", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.num("Page 12")).toBe("Page 12");
  });
});

describe("shamsi (ISO -> Solar Hijri label)", () => {
  it("formats an ISO date with the localized month name in English", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.shamsi("2026-07-17")).toBe("26 Saratan");
    expect(result.current.shamsi("2026-07-17", { withYear: true })).toBe("26 Saratan 1405");
  });

  it("uses Eastern digits and the Dari month name for fa", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.shamsi("2026-07-17")).toBe("۲۶ سرطان");
  });
});

describe("shamsiMonthName", () => {
  it("returns the localized month name (1-based)", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.shamsiMonthName(1)).toBe("Hamal");
    expect(result.current.shamsiMonthName(12)).toBe("Hut");
  });

  it("clamps out-of-range month numbers", () => {
    localStorage.setItem("worktrack.locale", "en");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.shamsiMonthName(0)).toBe("Hamal");
    expect(result.current.shamsiMonthName(99)).toBe("Hut");
  });
});

describe("setLocale", () => {
  it("switches locale, persists it, and updates the document direction", async () => {
    const user = userEvent.setup();

    function Probe() {
      const { locale, t, setLocale } = useI18n();
      return (
        <div>
          <span data-testid="label">{t("nav_dashboard")}</span>
          <span data-testid="locale">{locale}</span>
          <button onClick={() => setLocale("en")}>english</button>
        </div>
      );
    }

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("fa");

    await user.click(screen.getByRole("button", { name: "english" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("label")).toHaveTextContent("Dashboard");
    expect(localStorage.getItem("worktrack.locale")).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("useI18n outside a provider", () => {
  it("throws a helpful error", () => {
    // Silence the expected React error-boundary console noise for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useI18n())).toThrow(/must be used within LocaleProvider/);
    spy.mockRestore();
  });
});
