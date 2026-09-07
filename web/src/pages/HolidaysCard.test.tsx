import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Holiday } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const state = vi.hoisted(() => ({
  holidays: [] as Holiday[],
  permissions: new Set<string>(),
}));

vi.mock("../api/hooks", () => ({
  useHolidays: () => ({ data: state.holidays, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveHoliday: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHoliday: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSeedHolidays: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => state.permissions.has(p),
}));

const { HolidaysCard } = await import("./HolidaysCard");

function holiday(over: Partial<Holiday> = {}): Holiday {
  return {
    date: "2026-08-19",
    name: "روز استقلال",
    nameEn: "Independence Day",
    paid: true,
    source: "SOLAR_RECURRING",
    ...over,
  };
}

function renderCard() {
  return render(
    <LocaleProvider>
      <HolidaysCard />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  state.holidays = [];
  state.permissions = new Set(["calendar:write"]);
});

describe("working calendar card", () => {
  it("shows a holiday with both its Shamsi and Gregorian date", () => {
    state.holidays = [holiday()];
    renderCard();
    // 28 Asad 1405 is 19 August 2026. The month keeps its Dari name in every
    // locale — the Solar Hijri months have no English names, only
    // transliterations, and an Afghan reader knows them as اسد.
    expect(screen.getByText(/28 اسد 1405/)).toBeInTheDocument();
    expect(screen.getByText("2026-08-19")).toBeInTheDocument();
  });

  it("marks a generated holiday so it is not mistaken for a manual entry", () => {
    state.holidays = [holiday()];
    renderCard();
    expect(screen.getByText("Generated")).toBeInTheDocument();
  });

  it("does not mark a manually added one", () => {
    state.holidays = [holiday({ source: "MANUAL", name: "عید فطر" })];
    renderCard();
    expect(screen.queryByText("Generated")).not.toBeInTheDocument();
  });

  it("distinguishes paid from unpaid closures", () => {
    state.holidays = [
      holiday({ date: "2026-08-19", paid: true }),
      holiday({ date: "2026-08-20", paid: false, source: "MANUAL" }),
    ];
    renderCard();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
  });

  it("hides every control from someone who may only look", () => {
    state.permissions = new Set();
    state.holidays = [holiday()];
    renderCard();
    expect(screen.queryByText("Add")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
    expect(screen.queryByText(/Generate this year/)).not.toBeInTheDocument();
  });

  it("still shows the holidays to that person", () => {
    state.permissions = new Set();
    state.holidays = [holiday()];
    renderCard();
    // An employee needs to know the office is shut.
    expect(screen.getByText("روز استقلال")).toBeInTheDocument();
  });

  it("says so when the year has no holidays yet", () => {
    renderCard();
    expect(screen.getByText("No holidays recorded for this year")).toBeInTheDocument();
  });

  it("explains why the lunar holidays are not generated", () => {
    renderCard();
    expect(screen.getByText(/announced by sighting/)).toBeInTheDocument();
  });

  it("leaves out a holiday from a different year", () => {
    state.holidays = [holiday({ date: "2027-08-20" })];
    renderCard();
    expect(screen.getByText("No holidays recorded for this year")).toBeInTheDocument();
  });
});
