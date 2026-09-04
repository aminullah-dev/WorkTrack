import { nowTimestamp, tenant } from "../lib/firestore";
import { shamsiMonthEndIso, shamsiMonthStartIso } from "../lib/shamsi";

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
  name: string;
  code: string;
  type: "EARNING" | "DEDUCTION" | "EMPLOYER_COST";
  calc: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS";
  value: number;
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
}

const LOP_DIVISOR = 30; // monthly salary / 30 per unpaid day (common in AF)

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

  const [employeesSnap, componentsSnap] = await Promise.all([
    tenant(cid, "employees").where("status", "==", "ACTIVE").get(),
    tenant(cid, "salaryComponents").where("active", "==", true).get(),
  ]);

  const components = componentsSnap.docs.map((d) => d.data() as SalaryComponentDoc);
  const earnings = components.filter((c) => c.type === "EARNING");
  const deductions = components.filter((c) => c.type === "DEDUCTION");

  let totalNet = 0;
  let totalGross = 0;
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
    if (!salarySnap.exists) continue; // no salary on file → skip
    const basic = (salarySnap.data()?.basicAmount as number | undefined) ?? 0;

    // Attendance-derived day counts for the period.
    let workedDays = 0;
    let paidLeaveDays = 0;
    let lopDays = 0;
    for (const dayDoc of daysSnap.docs) {
      const status = (dayDoc.data().status as string) ?? "";
      if (status === "PRESENT") workedDays += 1;
      else if (status === "HALF_DAY") {
        workedDays += 0.5;
        lopDays += 0.5;
      } else if (status === "LEAVE") paidLeaveDays += 1;
      // PENDING is what the projection writes for a day that has punches but no
      // valid check-in. Only "ABSENT" was counted, and nothing has ever written
      // that status, so an employee who never worked was paid in full.
      else if (status === "ABSENT" || status === "PENDING") lopDays += 1;
    }

    // Earnings: BASIC + each active earning component.
    const lines: PayslipLine[] = [
      { componentCode: "BASIC", componentName: "معاش اساسی", type: "EARNING", amount: round2(basic) },
    ];
    for (const c of earnings) {
      const amount = c.calc === "PERCENT_OF_BASIC" ? (basic * c.value) / 100 : c.value;
      lines.push({ componentCode: c.code, componentName: c.name, type: "EARNING", amount: round2(amount) });
    }
    const gross = round2(lines.reduce((s, l) => s + l.amount, 0));

    // Deductions: component deductions + loss-of-pay for unpaid days.
    for (const c of deductions) {
      let amount = c.value;
      if (c.calc === "PERCENT_OF_BASIC") amount = (basic * c.value) / 100;
      else if (c.calc === "PERCENT_OF_GROSS") amount = (gross * c.value) / 100;
      lines.push({ componentCode: c.code, componentName: c.name, type: "DEDUCTION", amount: round2(amount) });
    }
    if (lopDays > 0) {
      lines.push({
        componentCode: "LOP",
        componentName: "کسر غیرحاضری",
        type: "DEDUCTION",
        amount: round2((basic / LOP_DIVISOR) * lopDays),
      });
    }

    const totalDeductions = round2(
      lines.filter((l) => l.type === "DEDUCTION").reduce((s, l) => s + l.amount, 0),
    );
    const net = round2(gross - totalDeductions);

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
    payslipCount += 1;
  }

  await tenant(cid, "payrollRuns").doc(runId).set({
    companyId: cid,
    periodYear,
    periodMonth,
    status: "APPROVED",
    startedBy,
    approvedBy: startedBy,
    currency,
    payslipCount,
    totalGross: round2(totalGross),
    totalNet: round2(totalNet),
    lockedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return {
    runId,
    periodYear,
    periodMonth,
    currency,
    payslipCount,
    totalNet: round2(totalNet),
    totalGross: round2(totalGross),
  };
}
