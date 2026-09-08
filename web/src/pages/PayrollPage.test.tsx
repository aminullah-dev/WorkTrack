import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { PayrollRun, PayrollRunResult } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

/**
 * What a payroll run is allowed to hide.
 *
 * Two things about a run are true but invisible in the numbers themselves: that
 * the month has not finished, and that some employees produced no payslip at
 * all. Both make a run look complete when it is not, and both cost real money.
 */

const runResult = vi.hoisted(() => ({
  current: {
    runId: "1405_05",
    periodYear: 1405,
    periodMonth: 5,
    currency: "AFN",
    payslipCount: 1,
    totalNet: 28100,
    totalGross: 30000,
    totalTax: 1900,
    totalEmployerCost: 0,
    periodComplete: true,
    skippedNoSalary: [],
  } as PayrollRunResult,
}));
const runs = vi.hoisted(() => ({ current: [] as PayrollRun[] }));

vi.mock("../api/hooks", () => ({
  usePayrollRuns: () => ({
    data: runs.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRunPayroll: () => ({
    mutateAsync: vi.fn(async () => runResult.current),
    isPending: false,
  }),
  useRunPayslips: () => ({ data: [], isLoading: false, isError: false }),
  // The page also carries the earnings-and-deductions card; it is exercised by
  // its own test, so keep it inert here.
  useSalaryComponents: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveSalaryComponent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => () => true,
  useAuth: () => ({ me: { timezone: "Asia/Kabul" } }),
}));

const { PayrollPage } = await import("./PayrollPage");

function run(over: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: "1405_05",
    periodYear: 1405,
    periodMonth: 5,
    status: "APPROVED",
    currency: "AFN",
    payslipCount: 12,
    totalGross: 360000,
    totalNet: 337200,
    totalTax: 22800,
    totalEmployerCost: 0,
    periodComplete: true,
    lockedAt: null,
    createdAt: null,
    ...over,
  };
}

function renderPage(): void {
  render(<LocaleProvider>{(<PayrollPage />) as ReactNode}</LocaleProvider>);
}

describe("payroll runs", () => {
  beforeEach(() => {
    // The provider reads the stored locale; assertions below are the English.
    localStorage.setItem("worktrack.locale", "en");
    runs.current = [];
    runResult.current = { ...runResult.current, skippedNoSalary: [] };
  });

  it("marks a run made before its month ended as provisional", () => {
    runs.current = [run({ periodComplete: false })];
    renderPage();
    expect(screen.getByText("Provisional")).toBeInTheDocument();
  });

  it("does not mark a completed month", () => {
    runs.current = [run({ periodComplete: true })];
    renderPage();
    expect(screen.queryByText("Provisional")).not.toBeInTheDocument();
  });

  it("treats a run from before the field existed as a completed month", () => {
    // Older runs carry no periodComplete; they were all whole months.
    const legacy = run();
    delete (legacy as Partial<PayrollRun>).periodComplete;
    runs.current = [legacy];
    renderPage();
    expect(screen.queryByText("Provisional")).not.toBeInTheDocument();
  });

  it("names the employees a run could not pay", async () => {
    runResult.current = {
      ...runResult.current,
      skippedNoSalary: [
        { employeeId: "e2", name: "Zahra Ahmadi" },
        { employeeId: "e3", name: "Omid Noori" },
      ],
    };
    renderPage();

    await userEvent.click(screen.getByText("Run payroll"));

    await waitFor(() =>
      expect(
        screen.getByText("2 employees were left out of this run"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Zahra Ahmadi")).toBeInTheDocument();
    expect(screen.getByText("Omid Noori")).toBeInTheDocument();
  });

  it("says nothing when everyone was paid", async () => {
    renderPage();
    await userEvent.click(screen.getByText("Run payroll"));

    await waitFor(() =>
      expect(screen.getByText(/Payroll calculated/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/left out of this run/)).not.toBeInTheDocument();
  });
});
