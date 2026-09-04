import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { WeeklyAttendance } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const weekData = vi.hoisted(() => ({ current: null as WeeklyAttendance | null }));

vi.mock("../api/hooks", () => ({
  useWeeklyAttendance: () => ({
    data: weekData.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { timezone: "Asia/Kabul" } }),
}));

const { AttendanceWeekly } = await import("./AttendanceWeekly");

const DATES = [
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];

function day(over: Partial<WeeklyAttendance["rows"][0]["days"][0]> = {}) {
  return {
    date: DATES[0],
    status: "ABSENT",
    workedMinutes: 0,
    lateMinutes: 0,
    needsReview: false,
    rejectedCount: 0,
    ...over,
  };
}

function week(days: Partial<WeeklyAttendance["rows"][0]["days"][0]>[]): WeeklyAttendance {
  const full = DATES.map((date, i) => day({ ...days[i], date }));
  return {
    from: DATES[0],
    to: DATES[6],
    dates: DATES,
    rows: [
      {
        employeeId: "e1",
        employeeName: "Ahmad Karimi",
        employeeStatus: "ACTIVE",
        branchId: null,
        days: full,
        totalWorkedMinutes: full.reduce((s, d) => s + d.workedMinutes, 0),
        presentDays: full.filter((d) => d.status !== "ABSENT").length,
        lateDays: full.filter((d) => d.lateMinutes > 0).length,
        needsReviewDays: full.filter((d) => d.needsReview || d.rejectedCount > 0).length,
      },
    ],
  };
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  weekData.current = null;
});

describe("weekly attendance report", () => {
  it("lays out one column per day of the week", () => {
    weekData.current = week([]);
    render(
      <LocaleProvider>
        <AttendanceWeekly date={DATES[0]} />
      </LocaleProvider>,
    );
    // Employee + seven days + total.
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
  });

  it("shows worked hours, not raw minutes", () => {
    weekData.current = week([{ status: "PRESENT", workedMinutes: 450 }]);
    render(
      <LocaleProvider>
        <AttendanceWeekly date={DATES[0]} />
      </LocaleProvider>,
    );
    expect(screen.getAllByText("7:30").length).toBeGreaterThan(0);
  });

  it("totals the week", () => {
    weekData.current = week([
      { status: "PRESENT", workedMinutes: 480 },
      { status: "PRESENT", workedMinutes: 480 },
    ]);
    render(
      <LocaleProvider>
        <AttendanceWeekly date={DATES[0]} />
      </LocaleProvider>,
    );
    const row = screen.getByText("Ahmad Karimi").closest("tr")!;
    expect(within(row).getByText("16:00")).toBeInTheDocument();
  });

  it("marks an absent day rather than printing a zero", () => {
    weekData.current = week([]);
    render(
      <LocaleProvider>
        <AttendanceWeekly date={DATES[0]} />
      </LocaleProvider>,
    );
    const row = screen.getByText("Ahmad Karimi").closest("tr")!;
    expect(within(row).getAllByText("—")).toHaveLength(7);
  });

  it("flags a late day and a day needing review", () => {
    weekData.current = week([
      { status: "PRESENT", workedMinutes: 400, lateMinutes: 25 },
      { status: "PRESENT", workedMinutes: 400, needsReview: true },
    ]);
    render(
      <LocaleProvider>
        <AttendanceWeekly date={DATES[0]} />
      </LocaleProvider>,
    );
    expect(screen.getByTitle("Late by 25 min")).toBeInTheDocument();
    expect(screen.getByTitle("Needs review")).toBeInTheDocument();
  });
});
