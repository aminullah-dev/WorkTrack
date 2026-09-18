import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RunPayslipRow } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { DICTIONARIES } from "../i18n/strings";

/**
 * The sheet that gets printed and signed, and the file the accountant opens.
 *
 * These two exist because everything WorkTrack computes stops being usable at
 * the edge of the screen. Most workers here have no bank account: pay is
 * counted out in cash against a signature, and the accountant keeps the year
 * in Excel. What can go wrong is quiet — a signature column that is not empty,
 * a CSV whose numbers arrive as text, names that arrive as mojibake.
 */

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { companyName: "شرکت ساختمانی کابل" } }),
}));

const { PaymentSheet, payrollCsv } = await import("./PaymentSheet");

function row(over: Partial<RunPayslipRow> = {}): RunPayslipRow {
  return {
    id: "e1_1405_06",
    employeeId: "e1",
    employeeCode: "E-001",
    employeeName: "احمد رحیمی",
    currency: "AFN",
    gross: 50000,
    totalDeductions: 8400,
    net: 41600,
    incomeTax: 3400,
    employerCost: 2250,
    costToCompany: 52250,
    workedDays: 16,
    lopDays: 0,
    status: "FINALIZED",
    ...over,
  };
}

function show(rows: RunPayslipRow[]): void {
  render(
    <LocaleProvider>
      <PaymentSheet runId="1405_06" rows={rows} onClose={vi.fn()} />
    </LocaleProvider>,
  );
}

describe("the printed sheet", () => {
  it("leaves the signature column completely empty", () => {
    // The one column the page exists for. Anything printed in it — a dash, a
    // zero, a repeated name — is something a person has to sign around.
    show([row()]);
    const cells = document.querySelectorAll("td.sheet-sign");
    expect(cells).toHaveLength(1);
    expect(cells[0].textContent).toBe("");
  });

  it("keys each line by employee code, not by name alone", () => {
    // Two people called احمد in one company is the ordinary case, and a signed
    // line has to say which one signed it.
    show([
      row({ employeeCode: "E-001" }),
      row({ id: "x", employeeCode: "E-007", employeeName: "احمد کریمی" }),
    ]);

    // The digits are localised, so read the cells rather than guessing the
    // rendered form of "E-001".
    const codes = [...document.querySelectorAll("tbody tr")].map(
      (tr) => tr.querySelectorAll("td")[1].textContent,
    );
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(2);
    expect(codes.every((c) => c?.startsWith("E-"))).toBe(true);
  });

  it("prints a dash rather than a blank for somebody with no code", () => {
    // Employees created before codes existed. A blank cell in the key column
    // reads as a printing fault.
    show([row({ employeeCode: "" })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the period the money is for", () => {
    show([row()]);
    // سنبله is month 6; ۱۴۰۵ the year. A sheet with no period on it cannot be
    // filed.
    expect(document.body.textContent).toContain("سنبله");
    expect(document.body.textContent).toContain("۱۴۰۵");
  });

  it("names the company, because the sheet leaves the building", () => {
    show([row()]);
    expect(screen.getByText("شرکت ساختمانی کابل")).toBeInTheDocument();
  });

  it("totals what the payer has to count out", () => {
    show([row({ net: 41600 }), row({ id: "b", net: 31866 })]);
    // 73,466 — the number the person carrying the cash checks before starting.
    expect(document.body.textContent).toContain("۷۳,۴۶۶");
  });

  it("renders into <body>, or the print rule hides it along with the app", () => {
    // `body > *:not(.sheet-backdrop)` is what puts the sheet alone on the
    // paper. Inside #root, that rule hides #root — and the sheet with it — and
    // printing gives a blank page. This is the only assertion that would have
    // caught it; the others all passed while it was broken.
    show([row()]);
    const sheet = document.querySelector(".sheet-backdrop");
    expect(sheet?.parentElement).toBe(document.body);
  });

  it("keeps its own controls off the paper", () => {
    show([row()]);
    const toolbar = document.querySelector(".sheet-toolbar");
    // The print and close buttons are screen furniture; `no-print` is what the
    // stylesheet keys on to drop them.
    expect(toolbar?.classList.contains("no-print")).toBe(true);
  });

  it("gives the payer and the approver somewhere to sign", () => {
    // An unsigned sheet proves nothing about who handed the cash over.
    show([row()]);
    expect(screen.getByText(DICTIONARIES.fa.sheet_paid_by)).toBeInTheDocument();
    expect(screen.getByText(DICTIONARIES.fa.sheet_approved_by)).toBeInTheDocument();
  });
});

describe("the spreadsheet", () => {
  it("writes numbers Excel can add up", () => {
    // Eastern digits arrive as text and every column stops summing — which is
    // the one thing the accountant opened the file for.
    const csv = payrollCsv([row()]);
    expect(csv).toContain("50000");
    expect(csv).not.toMatch(/[۰-۹]/);
  });

  it("starts with a BOM so Windows Excel reads the Dari names", () => {
    // Without it the whole name column is mojibake.
    expect(payrollCsv([row()]).charCodeAt(0)).toBe(0xfeff);
  });

  it("keeps a name containing a comma in one column", () => {
    const csv = payrollCsv([row({ employeeName: 'رحیمی, احمد "ح"' })]);
    expect(csv).toContain('"رحیمی, احمد ""ح"""');
    // Header plus one row, and the row did not split into two lines.
    expect(csv.trim().split("\n")).toHaveLength(2);
  });

  it("carries the columns an accountant reconciles against", () => {
    const header = payrollCsv([]).split("\n")[0];
    for (const column of ["employee_code", "gross", "income_tax", "net", "lop_days"]) {
      expect(header).toContain(column);
    }
  });

  it("produces a header even with nothing to export", () => {
    expect(payrollCsv([]).trim().split("\n")).toHaveLength(1);
  });
});
