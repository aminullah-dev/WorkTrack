import { nowTimestamp, tenant } from "../lib/firestore";
import { shamsiMonthEndIso, shamsiMonthStartIso } from "../lib/shamsi";
import { ensureAccounts, postJournalEntry } from "./accounting";
import { localDateOf } from "./attendance";
import { expectedWorkingDays, holidaySet } from "./calendar";
import { componentsForEmployee, listAssignments } from "./salaryAssignments";
import type { ComponentScope } from "./salaryAssignments";
import { getSettings } from "./settings";

/**
 * Payroll calculation for one Solar Hijri month.
 *
 * For each active employee: BASIC (from their EmployeeSalary) plus every active
 * EARNING component makes up gross; DEDUCTION components plus a loss-of-pay
 * charge for unpaid absences make up deductions; net = gross − deductions.
 * Day counts come from the attendanceDays projection over the month's Gregorian
 * date range.
 *
 * At small/medium sizes this reads per-employee sequentially. For 100k-employee
 * tenants this runs as a Cloud Tasks fan-out over BigQuery-sourced day counts
 * (see docs/02); the payslip shape is identical, so clients are unaffected.
 */

interface SalaryComponentDoc {
  /** Needed to match a component against one employee's assignments. */
  id: string;
  name: string;
  code: string;
  type: "EARNING" | "DEDUCTION" | "EMPLOYER_COST";
  calc: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS";
  value: number;
  /** EARNING only: whether this allowance forms part of the income-tax base. */
  taxable?: boolean;
  /** Absent on components written before individual assignment existed. */
  scope?: ComponentScope;
  active: boolean;
}

interface PayslipLine {
  componentCode: string;
  componentName: string;
  type: string;
  amount: number;
}

export interface PayrollRunResult {
  runId: string;
  periodYear: number;
  periodMonth: number;
  currency: string;
  payslipCount: number;
  totalNet: number;
  totalGross: number;
  totalTax: number;
  totalEmployerCost: number;
  /** Active employees left out because they have no salary configured. */
  skippedNoSalary: Array<{ employeeId: string; name: string }>;
  /** People marked EXITED who nonetheless worked in this period and were paid nothing. */
  skippedExited: Array<{ employeeId: string; name: string }>;
  /**
   * False when the period had not ended yet at the time of the run, so the
   * figures cover only the days elapsed so far and will change if it is run
   * again after the month closes.
   */
  periodComplete: boolean;
}

/**
 * Unpaid absence is charged as a share of the month's expected working days,
 * not as salary/30.
 *
 * Counting absence in working days while dividing by 30 calendar days is
 * inconsistent, and it shows at the extreme: a month with 26 working days, none
 * of them attended, docked 26/30 of the salary and left the employee paid for
 * four days they did not work. Dividing by the same working days the absence is
 * counted in makes a fully absent month cost exactly the month.
 */
function lopPerDay(basic: number, workingDaysInPeriod: number): number {
  if (workingDaysInPeriod <= 0) return 0;
  return basic / workingDaysInPeriod;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Afghanistan monthly wage-withholding income tax (Income Tax Law, Art. 4).
 * Brackets on monthly taxable salary (AFN):
 *   0–5,000            → 0%
 *   5,001–12,500       → 2% of amount over 5,000
 *   12,501–100,000     → 150 + 10% of amount over 12,500
 *   over 100,000       → 8,900 + 20% of amount over 100,000
 */
export function computeAfghanIncomeTax(taxable: number): number {
  if (taxable <= 5000) return 0;
  if (taxable <= 12500) return round2((taxable - 5000) * 0.02);
  if (taxable <= 100000) return round2(150 + (taxable - 12500) * 0.1);
  return round2(8900 + (taxable - 100000) * 0.2);
}

export async function computePayrollRun(
  cid: string,
  periodYear: number,
  periodMonth: number,
  startedBy: string,
  currency: string,
): Promise<PayrollRunResult> {
  const fromIso = shamsiMonthStartIso(periodYear, periodMonth);
  const toIso = shamsiMonthEndIso(periodYear, periodMonth);
  const runId = `${periodYear}_${String(periodMonth).padStart(2, "0")}`;

  const [employeesSnap, formerSnap, componentsSnap, assignments, settings, holidays] =
    await Promise.all([
    tenant(cid, "employees").where("status", "==", "ACTIVE").get(),
    // Only to warn about, never to pay: see the check after the run.
    tenant(cid, "employees").where("status", "==", "EXITED").get(),
    tenant(cid, "salaryComponents").where("active", "==", true).get(),
    // One query for the whole company rather than one per employee: the
    // exceptions are few and the run already reads per employee enough.
    listAssignments(cid),
    getSettings(cid),
    holidaySet(cid, fromIso, toIso),
  ]);

  // The days people were actually expected in. Weekends and public holidays are
  // excluded, so neither is ever mistaken for absence.
  const workingDays = expectedWorkingDays(
    fromIso,
    toIso,
    settings.policies.weekendDays,
    holidays,
  );

  // …but only the ones that have actually happened can be judged. A run for the
  // month still in progress — which is what the portal offers by default — would
  // otherwise charge every remaining day as unexcused absence and halve the pay
  // of someone with a clean record. A future day is neither worked nor absent.
  //
  // The divisor below stays the whole month, because a day of salary is worth
  // basic ÷ the month's working days no matter when the run happens.
  const todayIso = localDateOf(new Date(), settings.profile.timezone);
  const elapsedWorkingDays = workingDays.filter((d) => d <= todayIso);
  const periodComplete = toIso <= todayIso;

  /** Active employees with no salary on file; they earn nothing and are named. */
  const skipped: Array<{ employeeId: string; name: string }> = [];

  const components = componentsSnap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as SalaryComponentDoc,
  );

  // Which components each person gets, and at what amount, is resolved per
  // employee inside the loop below — the same component can apply to one
  // person at a different figure, or not at all.
  const assignmentsByEmployee = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByEmployee.get(a.employeeId);
    if (list) list.push(a);
    else assignmentsByEmployee.set(a.employeeId, [a]);
  }

  let totalNet = 0;
  let totalGross = 0;
  let totalTax = 0;
  let totalEmployerCost = 0;
  // Non-tax deduction components, withheld from employees and owed onward.
  let totalWithheld = 0;
  let payslipCount = 0;
  const now = nowTimestamp();

  for (const empDoc of employeesSnap.docs) {
    const employeeId = empDoc.id;

    const [salarySnap, daysSnap] = await Promise.all([
      tenant(cid, "employeeSalaries").doc(employeeId).get(),
      tenant(cid, "attendanceDays")
        .where("employeeId", "==", employeeId)
        .where("date", ">=", fromIso)
        .where("date", "<=", toIso)
        .get(),
    ]);
    if (!salarySnap.exists) {
      // Silently omitting people is how a first payroll run comes out looking
      // right and paying half the company nothing. Name them on the run so the
      // administrator sees who needs a salary before they pay anyone.
      const e = empDoc.data() as { firstName?: string; lastName?: string };
      skipped.push({
        employeeId,
        name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || employeeId,
      });
      continue;
    }
    const basic = (salarySnap.data()?.basicAmount as number | undefined) ?? 0;

    // Day counts, driven by the working calendar rather than by whichever
    // attendance documents happen to exist.
    //
    // The previous version iterated the documents it found. A document is only
    // written when something happens — a punch, an approved leave, a correction
    // — so somebody who simply never came to work produced none at all and was
    // paid in full. Walking the expected working days instead makes that case
    // visible: a working day with no record is unexcused absence.
    const byDate = new Map<string, string>();
    for (const dayDoc of daysSnap.docs) {
      const d = dayDoc.data();
      byDate.set(d.date as string, (d.status as string) ?? "");
    }

    let workedDays = 0;
    let paidLeaveDays = 0;
    let lopDays = 0;
    for (const date of elapsedWorkingDays) {
      const status = byDate.get(date);
      if (status === "PRESENT") workedDays += 1;
      else if (status === "HALF_DAY") {
        workedDays += 0.5;
        lopDays += 0.5;
      } else if (status === "LEAVE") paidLeaveDays += 1;
      // PENDING means punches exist but no valid check-in; no record at all
      // means the person never turned up. Both are unpaid.
      else lopDays += 1;
    }

    // This employee's components: the company-wide ones they have not been
    // excluded from, plus any assigned only to them, each at whichever amount
    // applies to them. Substituting the resolved amount into `value` keeps the
    // arithmetic below identical to the company-wide case.
    const mine = componentsForEmployee(
      components,
      assignmentsByEmployee.get(employeeId) ?? [],
    ).map((r) => ({ ...r.component, value: r.amount }));
    const earnings = mine.filter((c) => c.type === "EARNING");
    const deductions = mine.filter((c) => c.type === "DEDUCTION");
    const employerCosts = mine.filter((c) => c.type === "EMPLOYER_COST");

    // Earnings: BASIC + each active earning component.
    const lines: PayslipLine[] = [
      { componentCode: "BASIC", componentName: "معاش اساسی", type: "EARNING", amount: round2(basic) },
    ];
    // Basic pay is always taxable; an allowance is taxable only if its component
    // says so. The base is accumulated here rather than derived from gross,
    // which would tax exempt allowances too.
    let taxableEarnings = round2(basic);
    for (const c of earnings) {
      const amount = round2(c.calc === "PERCENT_OF_BASIC" ? (basic * c.value) / 100 : c.value);
      lines.push({ componentCode: c.code, componentName: c.name, type: "EARNING", amount });
      if (c.taxable) taxableEarnings = round2(taxableEarnings + amount);
    }
    const gross = round2(lines.reduce((s, l) => s + l.amount, 0));

    // Deductions: component deductions + loss-of-pay for unpaid days.
    let withheld = 0;
    for (const c of deductions) {
      let amount = c.value;
      if (c.calc === "PERCENT_OF_BASIC") amount = (basic * c.value) / 100;
      else if (c.calc === "PERCENT_OF_GROSS") amount = (gross * c.value) / 100;
      amount = round2(amount);
      lines.push({ componentCode: c.code, componentName: c.name, type: "DEDUCTION", amount });
      withheld = round2(withheld + amount);
    }

    // Capped at gross: a spell of unpaid absence cannot dock more than the
    // month actually earned. Uncapped, a long spell drove net — and the ledger
    // accrual derived from it — negative.
    let lopAmount = 0;
    if (lopDays > 0) {
      lopAmount = Math.min(round2(lopPerDay(basic, workingDays.length) * lopDays), gross);
      lines.push({
        componentCode: "LOP",
        componentName: "کسر غیرحاضری",
        type: "DEDUCTION",
        amount: lopAmount,
      });
    }

    // Statutory income tax (progressive) on pay actually earned: the taxable
    // earnings less the unpaid-absence charge. Taxing the pre-LOP figure
    // withheld tax on money the employee never received.
    const incomeTax = computeAfghanIncomeTax(Math.max(0, round2(taxableEarnings - lopAmount)));
    if (incomeTax > 0) {
      lines.push({
        componentCode: "TAX",
        componentName: "مالیهٔ معاش",
        type: "DEDUCTION",
        amount: incomeTax,
      });
    }

    // Employer-borne cost (e.g. contributions) — not deducted from the employee,
    // reported separately for the true cost-to-company.
    let employerCost = 0;
    for (const c of employerCosts) {
      let amount = c.value;
      if (c.calc === "PERCENT_OF_BASIC") amount = (basic * c.value) / 100;
      else if (c.calc === "PERCENT_OF_GROSS") amount = (gross * c.value) / 100;
      employerCost += round2(amount);
      lines.push({ componentCode: c.code, componentName: c.name, type: "EMPLOYER_COST", amount: round2(amount) });
    }
    employerCost = round2(employerCost);

    const totalDeductions = round2(
      lines.filter((l) => l.type === "DEDUCTION").reduce((s, l) => s + l.amount, 0),
    );
    // Floored at zero — a payslip never pays out a negative amount. With loss
    // of pay capped at gross this only trips on a misconfigured deduction
    // component, and the ledger below follows the floored figure.
    const net = round2(Math.max(0, gross - totalDeductions));

    const payslipId = `${employeeId}_${runId}`;
    await tenant(cid, "payslips").doc(payslipId).set({
      companyId: cid,
      runId,
      employeeId,
      periodYear,
      periodMonth,
      currency,
      gross,
      totalDeductions,
      net,
      incomeTax,
      employerCost,
      costToCompany: round2(gross + employerCost),
      workedDays,
      paidLeaveDays,
      lopDays,
      overtimeMinutes: 0,
      status: "FINALIZED",
      pdfUrl: null,
      lines,
      updatedAt: now,
    });

    totalGross += gross;
    totalNet += net;
    totalTax += incomeTax;
    totalWithheld += withheld;
    totalEmployerCost += employerCost;
    payslipCount += 1;
  }

  // Someone marked EXITED is not paid — but if they worked in this period, the
  // run has just left a person who turned up with nothing at all, and says so
  // nowhere. This does not pay them; it makes them impossible to miss. The way
  // out is to set them ACTIVE, run the month again, then mark them EXITED.
  const workedThenLeft: Array<{ employeeId: string; name: string }> = [];
  for (const doc of formerSnap.docs) {
    const worked = await tenant(cid, "attendanceDays")
      .where("employeeId", "==", doc.id)
      .where("date", ">=", fromIso)
      .where("date", "<=", toIso)
      .limit(1)
      .get();
    if (worked.empty) continue;
    const e = doc.data() as { firstName?: string; lastName?: string };
    workedThenLeft.push({
      employeeId: doc.id,
      name: `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || doc.id,
    });
  }

  await tenant(cid, "payrollRuns").doc(runId).set({
    companyId: cid,
    periodYear,
    periodMonth,
    status: "APPROVED",
    // A run for a month still in progress is a preview, not the final word.
    periodComplete,
    skippedNoSalary: skipped,
    skippedExited: workedThenLeft,
    startedBy,
    approvedBy: startedBy,
    currency,
    payslipCount,
    totalGross: round2(totalGross),
    totalNet: round2(totalNet),
    totalTax: round2(totalTax),
    totalEmployerCost: round2(totalEmployerCost),
    lockedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Accrue the run to the general ledger. The expense recognised is what the
  // run actually produced: take-home pay, plus everything withheld on the
  // employees' behalf, plus employer-borne cost. Deriving the debit from the
  // credits is what keeps the entry balanced whatever components a company has
  // configured — the previous version credited Salaries Payable with
  // gross − tax, overstating the liability by the loss-of-pay charge and by
  // every non-tax deduction, and debited an equally overstated expense.
  if (payslipCount > 0) {
    const credits = [
      { accountCode: "2100", accountName: "Salaries Payable", debit: 0, credit: round2(totalNet) },
      { accountCode: "2200", accountName: "Taxes Payable", debit: 0, credit: round2(totalTax) },
      {
        accountCode: "2300",
        accountName: "Employee Withholdings",
        debit: 0,
        credit: round2(totalWithheld),
      },
      {
        accountCode: "2400",
        accountName: "Employer Contributions Payable",
        debit: 0,
        credit: round2(totalEmployerCost),
      },
    ].filter((l) => l.credit > 0);
    const expense = round2(credits.reduce((sum, l) => sum + l.credit, 0));

    if (expense > 0) {
      // A company whose chart was seeded before these codes existed would
      // otherwise post to accounts the trial balance cannot resolve.
      await ensureAccounts(cid, ["5000", ...credits.map((l) => l.accountCode)]);

      // Idempotent: the id is derived from the run, so re-running the month
      // overwrites this entry in place instead of accruing it twice. Entries an
      // earlier version wrote under a random id are cleared first.
      const entryId = `PAYROLL_${runId}`;
      const prior = await tenant(cid, "journalEntries")
        .where("reference", "==", runId)
        .where("source", "==", "PAYROLL")
        .get();
      await Promise.all(
        prior.docs.filter((d) => d.id !== entryId).map((d) => d.ref.delete()),
      );

      await postJournalEntry(cid, {
        // A completed month accrues on its last day, which is what the books
        // expect. A run of a month still in progress must not: dating it at the
        // period end puts the whole salary cost on a date that has not arrived,
        // so the ledger and every trend built on it show an expense in the
        // future. Such a run is recognised on the day it was made.
        date: periodComplete ? toIso : todayIso,
        memo: `Payroll ${periodYear}/${String(periodMonth).padStart(2, "0")}`,
        reference: runId,
        source: "PAYROLL",
        entryId,
        createdBy: startedBy,
        lines: [
          { accountCode: "5000", accountName: "Salaries & Wages", debit: expense, credit: 0 },
          ...credits,
        ],
      });
    }
  }

  return {
    runId,
    periodYear,
    periodMonth,
    currency,
    payslipCount,
    totalNet: round2(totalNet),
    totalGross: round2(totalGross),
    totalTax: round2(totalTax),
    totalEmployerCost: round2(totalEmployerCost),
    periodComplete,
    skippedNoSalary: skipped,
    skippedExited: workedThenLeft,
  };
}
