import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ComponentAssignment, SalaryComponent } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

/**
 * One employee's exceptions against the company's components.
 *
 * The load-bearing behaviour is what happens when a row goes back to normal:
 * the exception must be deleted, not rewritten to match. An assignment that
 * merely copies today's company figure would freeze this person's pay the next
 * time that figure changes.
 */

const setCalls = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
const clearCalls = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));
const components = vi.hoisted(() => ({ current: [] as SalaryComponent[] }));
const assignments = vi.hoisted(() => ({ current: [] as ComponentAssignment[] }));

vi.mock("../api/hooks", () => ({
  useSalaryComponents: () => ({ data: components.current, isLoading: false, isError: false }),
  useEmployeeComponents: () => ({ data: assignments.current, isLoading: false, isError: false }),
  useSetEmployeeComponent: () => ({
    mutateAsync: vi.fn(async (a: Record<string, unknown>) => {
      setCalls.current.push(a);
    }),
    isPending: false,
  }),
  useClearEmployeeComponent: () => ({
    mutateAsync: vi.fn(async (a: Record<string, unknown>) => {
      clearCalls.current.push(a);
    }),
    isPending: false,
  }),
}));

const { EmployeeComponents } = await import("./EmployeeComponents");

function component(over: Partial<SalaryComponent> = {}): SalaryComponent {
  return {
    id: "transport",
    name: "Transport",
    code: "TRANSPORT",
    type: "EARNING",
    calc: "FIXED",
    value: 2000,
    taxable: true,
    scope: "ALL",
    active: true,
    ...over,
  };
}

function renderFor(employeeId: string | null = "e1"): void {
  render(
    <LocaleProvider>{(<EmployeeComponents employeeId={employeeId} />) as ReactNode}</LocaleProvider>,
  );
}

describe("one employee's earnings and deductions", () => {
  beforeEach(() => {
    localStorage.setItem("worktrack.locale", "en");
    setCalls.current = [];
    clearCalls.current = [];
    components.current = [component()];
    assignments.current = [];
  });

  it("asks for the employee to be saved before assigning anything", () => {
    renderFor(null);
    expect(screen.getByText(/Save the employee first/i)).toBeInTheDocument();
  });

  it("sends the administrator to define components when none exist", () => {
    components.current = [];
    renderFor();
    expect(screen.getByText(/Define them on the Payroll page first/i)).toBeInTheDocument();
  });

  it("shows a company-wide component as already applying", () => {
    renderFor();
    expect(screen.getByRole("switch", { name: /Applies — Transport/ })).toBeChecked();
  });

  it("treats a component with no scope as company-wide, like the server does", () => {
    // An older component, or an older server. Reading it as individual would
    // show a live allowance as not applying, and one click would withhold it.
    const legacy = component();
    delete (legacy as Partial<SalaryComponent>).scope;
    components.current = [legacy];
    renderFor();

    expect(screen.getByRole("switch", { name: /Applies — Transport/ })).toBeChecked();
    expect(screen.getByText(/everyone gets this/i)).toBeInTheDocument();
  });

  it("shows an individual component as not applying until it is given", () => {
    components.current = [component({ id: "bonus", name: "Bonus", scope: "INDIVIDUAL" })];
    renderFor();
    expect(screen.getByRole("switch", { name: /Applies — Bonus/ })).not.toBeChecked();
  });

  it("withholds a company-wide component by writing an inactive assignment", async () => {
    renderFor();
    await userEvent.click(screen.getByRole("switch", { name: /Applies — Transport/ }));

    expect(setCalls.current).toHaveLength(1);
    expect(setCalls.current[0]).toEqual({
      employeeId: "e1",
      componentId: "transport",
      body: { value: null, active: false },
    });
  });

  it("deletes the exception rather than rewriting it when a row returns to normal", async () => {
    // Writing {active:true} here would look identical today and diverge the
    // moment the company changes the amount.
    assignments.current = [
      { employeeId: "e1", componentId: "transport", value: null, active: false },
    ];
    renderFor();
    await userEvent.click(screen.getByRole("switch", { name: /Applies — Transport/ }));

    expect(setCalls.current).toHaveLength(0);
    expect(clearCalls.current).toEqual([{ employeeId: "e1", componentId: "transport" }]);
  });

  it("keeps the exception when the employee has their own amount", async () => {
    // Switching off must not discard the 3500 they are on.
    assignments.current = [
      { employeeId: "e1", componentId: "transport", value: 3500, active: true },
    ];
    renderFor();
    await userEvent.click(screen.getByRole("switch", { name: /Applies — Transport/ }));

    expect(clearCalls.current).toHaveLength(0);
    expect(setCalls.current[0]).toEqual({
      employeeId: "e1",
      componentId: "transport",
      body: { value: 3500, active: false },
    });
  });

  it("saves an amount that differs from the company's", async () => {
    renderFor();
    const box = screen.getByLabelText(/Their amount — Transport/);
    await userEvent.type(box, "3500");
    await userEvent.tab();

    expect(setCalls.current[0]).toEqual({
      employeeId: "e1",
      componentId: "transport",
      body: { value: 3500, active: true },
    });
  });

  it("treats zero as an amount, not as blank", async () => {
    renderFor();
    await userEvent.type(screen.getByLabelText(/Their amount — Transport/), "0");
    await userEvent.tab();

    expect(setCalls.current[0].body).toEqual({ value: 0, active: true });
  });

  it("clearing the amount drops the exception entirely", async () => {
    assignments.current = [
      { employeeId: "e1", componentId: "transport", value: 3500, active: true },
    ];
    renderFor();
    await userEvent.clear(screen.getByLabelText(/Their amount — Transport/));
    await userEvent.tab();

    expect(clearCalls.current).toEqual([{ employeeId: "e1", componentId: "transport" }]);
  });

  it("keeps a withheld employee's own amount, and locks the box while it is withheld", async () => {
    // Their 3500 is not lost by switching the row off — turning it back on
    // restores it rather than dropping them to the company figure.
    assignments.current = [
      { employeeId: "e1", componentId: "transport", value: 3500, active: false },
    ];
    renderFor();

    const box = screen.getByLabelText(/Their amount — Transport/);
    expect(box).toBeDisabled();
    expect(box).toHaveValue(3500);

    await userEvent.click(screen.getByRole("switch", { name: /Applies — Transport/ }));
    expect(setCalls.current[0].body).toEqual({ value: 3500, active: true });
  });

  it("shows the company amount as the placeholder so the default is visible", () => {
    renderFor();
    expect(screen.getByLabelText(/Their amount — Transport/)).toHaveAttribute(
      "placeholder",
      "2000",
    );
  });

  it("does not offer an amount for a component the employee does not get", () => {
    components.current = [component({ id: "bonus", name: "Bonus", scope: "INDIVIDUAL" })];
    renderFor();
    expect(screen.getByLabelText(/Their amount — Bonus/)).toBeDisabled();
  });

  it("leaves inactive components out entirely", () => {
    components.current = [component(), component({ id: "old", name: "Retired", active: false })];
    renderFor();
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
  });
});
