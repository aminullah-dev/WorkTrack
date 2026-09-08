import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { SalaryComponent } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

/**
 * Allowances and deductions — the only route by which anything other than basic
 * pay, income tax and the absence deduction reaches a payslip.
 */

const saved = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
const components = vi.hoisted(() => ({ current: [] as SalaryComponent[] }));
const permissions = vi.hoisted(() => ({ current: new Set(["payroll:read", "payroll:run"]) }));
const failure = vi.hoisted(() => ({ current: null as Error | null }));

vi.mock("../api/hooks", () => ({
  useSalaryComponents: () => ({
    data: components.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveSalaryComponent: () => ({
    mutateAsync: vi.fn(async (args: Record<string, unknown>) => {
      if (failure.current) throw failure.current;
      saved.calls.push(args);
      return {};
    }),
    isPending: false,
  }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => permissions.current.has(p),
}));

const { SalaryComponentsCard } = await import("./SalaryComponentsCard");

function component(over: Partial<SalaryComponent> = {}): SalaryComponent {
  return {
    id: "c1",
    name: "Transport allowance",
    code: "TRANSPORT",
    type: "EARNING",
    calc: "FIXED",
    value: 2000,
    taxable: true,
    active: true,
    ...over,
  };
}

function renderCard(): void {
  render(<LocaleProvider>{(<SalaryComponentsCard />) as ReactNode}</LocaleProvider>);
}

describe("earnings and deductions", () => {
  beforeEach(() => {
    localStorage.setItem("worktrack.locale", "en");
    saved.calls = [];
    components.current = [];
    failure.current = null;
    permissions.current = new Set(["payroll:read", "payroll:run"]);
  });

  it("says plainly what a payslip contains when nothing is defined", () => {
    renderCard();
    expect(
      screen.getByText(/Payslips show basic salary, income tax and the absence deduction only/i),
    ).toBeInTheDocument();
  });

  it("groups components by type", () => {
    components.current = [
      component(),
      component({ id: "c2", name: "Loan repayment", code: "LOAN", type: "DEDUCTION" }),
      component({ id: "c3", name: "Pension", code: "PENSION", type: "EMPLOYER_COST" }),
    ];
    renderCard();

    expect(screen.getByRole("heading", { name: "Earning" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deduction" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Employer cost" })).toBeInTheDocument();
  });

  it("does not offer percent of gross for an earning", async () => {
    // Payroll treats a percent-of-gross earning as a fixed amount, because gross
    // is the sum of the earnings. Offering it would produce 10 afghani where the
    // administrator meant 10 percent.
    renderCard();
    await userEvent.click(screen.getByText("Add item"));

    const calc = screen.getByLabelText("How it is calculated");
    expect(within(calc).queryByText("Percent of gross")).not.toBeInTheDocument();
    expect(within(calc).getByText("Percent of basic salary")).toBeInTheDocument();
  });

  it("offers percent of gross for a deduction", async () => {
    renderCard();
    await userEvent.click(screen.getByText("Add item"));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "DEDUCTION");

    expect(
      within(screen.getByLabelText("How it is calculated")).getByText("Percent of gross"),
    ).toBeInTheDocument();
  });

  it("drops percent of gross when the type changes back to an earning", async () => {
    renderCard();
    await userEvent.click(screen.getByText("Add item"));

    const type = screen.getByLabelText("Type");
    await userEvent.selectOptions(type, "DEDUCTION");
    await userEvent.selectOptions(screen.getByLabelText("How it is calculated"), "PERCENT_OF_GROSS");
    await userEvent.selectOptions(type, "EARNING");

    // Left as-is it would have submitted a combination payroll misreads.
    expect((screen.getByLabelText("How it is calculated") as HTMLSelectElement).value).toBe("FIXED");
  });

  it("saves a new allowance", async () => {
    renderCard();
    await userEvent.click(screen.getByText("Add item"));
    await userEvent.type(screen.getByLabelText("Name"), "Transport allowance");
    await userEvent.type(screen.getByLabelText("Code"), "transport");
    await userEvent.clear(screen.getByLabelText("Amount (AFN)"));
    await userEvent.type(screen.getByLabelText("Amount (AFN)"), "2000");
    await userEvent.click(screen.getByText("Save"));

    expect(saved.calls).toHaveLength(1);
    expect(saved.calls[0]).toEqual({
      id: undefined,
      body: {
        name: "Transport allowance",
        code: "TRANSPORT", // upper-cased for the server's pattern
        type: "EARNING",
        calc: "FIXED",
        value: 2000,
        taxable: true,
        active: true,
      },
    });
  });

  it("refuses a code the server's pattern would reject", async () => {
    renderCard();
    await userEvent.click(screen.getByText("Add item"));
    await userEvent.type(screen.getByLabelText("Name"), "Transport");
    await userEvent.type(screen.getByLabelText("Code"), "trans port!");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText(/must be capitals, digits and _ only/i)).toBeInTheDocument();
    expect(saved.calls).toHaveLength(0);
  });

  it("refuses a percentage over 100", async () => {
    renderCard();
    await userEvent.click(screen.getByText("Add item"));
    await userEvent.type(screen.getByLabelText("Name"), "Bonus");
    await userEvent.type(screen.getByLabelText("Code"), "BONUS");
    await userEvent.selectOptions(screen.getByLabelText("How it is calculated"), "PERCENT_OF_BASIC");
    await userEvent.clear(screen.getByLabelText("Percent"));
    await userEvent.type(screen.getByLabelText("Percent"), "150");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText(/cannot be more than 100/i)).toBeInTheDocument();
    expect(saved.calls).toHaveLength(0);
  });

  it("names the clashing code when the server rejects a duplicate", async () => {
    failure.current = new Error("A component with code TRANSPORT exists");
    renderCard();
    await userEvent.click(screen.getByText("Add item"));
    await userEvent.type(screen.getByLabelText("Name"), "Transport");
    await userEvent.type(screen.getByLabelText("Code"), "TRANSPORT");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText("Code TRANSPORT is already in use.")).toBeInTheDocument();
  });

  it("loads a component into the form for editing and sends its id", async () => {
    components.current = [component()];
    renderCard();
    await userEvent.click(screen.getByText("Edit"));

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Transport allowance");
    await userEvent.click(screen.getByText("Save"));

    expect(saved.calls[0].id).toBe("c1");
  });

  it("deactivates rather than deletes, so past payslips keep their line", async () => {
    components.current = [component()];
    renderCard();
    await userEvent.click(screen.getByText("Deactivate"));

    expect(saved.calls).toHaveLength(1);
    expect(saved.calls[0].id).toBe("c1");
    expect((saved.calls[0].body as SalaryComponent).active).toBe(false);
  });

  it("marks a tax-exempt earning", () => {
    components.current = [component({ taxable: false })];
    renderCard();
    expect(screen.getByText("Exempt")).toBeInTheDocument();
  });

  it("warns that a change does not touch payslips already produced", () => {
    components.current = [component()];
    renderCard();
    expect(screen.getByText(/does not alter payslips already produced/i)).toBeInTheDocument();
  });

  it("shows the list but no controls to someone who may only read payroll", () => {
    permissions.current = new Set(["payroll:read"]);
    components.current = [component()];
    renderCard();

    expect(screen.getByText("Transport allowance")).toBeInTheDocument();
    expect(screen.queryByText("Add item")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Deactivate")).not.toBeInTheDocument();
  });
});
