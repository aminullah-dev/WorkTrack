import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { computePayrollRun } from "./payroll";
import { currentShamsiMonth, shamsiMonthStartIso } from "../lib/shamsi";
import { localDateOf } from "./attendance";

/**
 * Payroll's engine was correct all along; nothing could feed it. employeeSalaries
 * had no write path outside the demo seed, and an employee with no salary on file
 * is skipped silently — so a real company got 200 with payslipCount 0 and a
 * portal that reported a successful, empty run.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let seq = 0;

async function employee(id: string): Promise<void> {
  await tenant(cid, "employees").doc(id).set({
    employeeCode: id,
    firstName: "Test",
    lastName: id,
    status: "ACTIVE",
    updatedAt: Timestamp.now(),
  });
}

async function salary(employeeId: string, basicAmount: number): Promise<void> {
  await tenant(cid, "employeeSalaries").doc(employeeId).set({
    employeeId,
    structureId: null,
    basicAmount,
    currency: "AFN",
    effectiveFrom: "2026-01-01",
    revisionReason: "Initial",
    updatedAt: Timestamp.now(),
  });
}

async function component(
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await tenant(cid, "salaryComponents").doc(id).set({
    companyId: cid,
    calc: "FIXED",
    active: true,
    ...fields,
  });
}

/** Unpaid-absence days inside Shamsi 1405/05 (2026-07-23 .. 2026-08-22). */
async function unpaidDays(employeeId: string, count: number): Promise<void> {
  const start = new Date("2026-07-23T00:00:00Z").getTime();
  for (let i = 0; i < count; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    await tenant(cid, "attendanceDays").doc(`${employeeId}_${date}`).set({
      employeeId,
      date,
      status: "PENDING",
      workedMinutes: 0,
    });
  }
}

/**
 * Marks every working day of Shamsi 1405/05 present, except the dates given.
 *
 * Payroll now walks the working calendar, so a test that only wants to exercise
 * the tax brackets or the ledger has to say the person turned up — otherwise
 * they read as absent for the whole month and earn nothing.
 */
async function attendAll(employeeId: string, except: string[] = []): Promise<void> {
  const skip = new Set(except);
  const end = new Date("2026-08-22T00:00:00Z").getTime();
  for (let t = new Date("2026-07-23T00:00:00Z").getTime(); t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 5) continue; // Friday: not a working day
    const date = d.toISOString().slice(0, 10);
    if (skip.has(date)) continue;
    await tenant(cid, "attendanceDays").doc(`${employeeId}_${date}`).set({
      employeeId, date, status: "PRESENT", workedMinutes: 480,
    });
  }
}

async function payrollEntries(): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "journalEntries").where("source", "==", "PAYROLL").get();
  return snap.docs.map((d) => d.data() as Record<string, unknown>);
}

interface Line { accountCode: string; debit: number; credit: number }

function creditOf(entry: Record<string, unknown>, code: string): number {
  const lines = (entry.lines as Line[]) ?? [];
  return lines.filter((l) => l.accountCode === code).reduce((s, l) => s + l.credit, 0);
}

function debitOf(entry: Record<string, unknown>, code: string): number {
  const lines = (entry.lines as Line[]) ?? [];
  return lines.filter((l) => l.accountCode === code).reduce((s, l) => s + l.debit, 0);
}

describe.skipIf(!EMULATOR)("payroll run", () => {
  beforeEach(async () => {
    cid = `pr_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({
      name: "Payroll",
      timezone: "Asia/Kabul",
      settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
    });
  });

  it("produces nothing for an employee with no salary on file", async () => {
    await employee("e1");

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    // This is the state a self-signed-up company was permanently in.
    expect(run.payslipCount).toBe(0);
  });

  it("produces a payslip once a salary is configured", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await attendAll("e1");

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.payslipCount).toBe(1);
    expect(run.totalGross).toBe(30000);
    expect(run.totalNet).toBeGreaterThan(0);
    expect(run.totalNet).toBeLessThanOrEqual(30000);
  });

  it("adds an earning component to gross", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await tenant(cid, "salaryComponents").doc("c1").set({
      companyId: cid,
      name: "Transport",
      code: "TRANSPORT",
      type: "EARNING",
      calc: "FIXED",
      value: 3000,
      taxable: false,
      active: true,
    });

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.payslipCount).toBe(1);
    expect(run.totalGross).toBe(33000);
  });

  it("ignores an inactive component", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await tenant(cid, "salaryComponents").doc("c1").set({
      companyId: cid,
      name: "Old bonus",
      code: "OLD",
      type: "EARNING",
      calc: "FIXED",
      value: 5000,
      active: false,
    });

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.totalGross).toBe(30000);
  });

  it("pays only the employees who have a salary", async () => {
    await employee("e1");
    await employee("e2");
    await salary("e1", 30000);

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.payslipCount).toBe(1);
  });
});

/**
 * Income tax was computed on gross before the loss-of-pay charge was applied,
 * so an employee was taxed on pay they never received; and the `taxable` flag
 * the components API writes was never read, so an exempt allowance was taxed
 * anyway. Loss of pay was also uncapped, which drove net pay negative.
 */
describe.skipIf(!EMULATOR)("payroll — income tax base", () => {
  beforeEach(async () => {
    cid = `tax_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({
      name: "Tax",
      timezone: "Asia/Kabul",
      settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
    });
  });

  it("does not tax pay lost to unpaid absence", async () => {
    await employee("e1");
    await salary("e1", 30000);
    const missed = ["2026-07-23", "2026-07-27", "2026-07-28"];
    await attendAll("e1", missed);

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    // 26 working days, 3 missed: 30000/26 * 3 = 3461.54 docked, leaving
    // 26538.46 earned. Tax = 150 + 10% of (26538.46 - 12500) = 1553.85.
    // Taxing the full 30000 gross would give 1900.
    expect(run.totalTax).toBe(1553.85);
  });

  it("leaves an exempt allowance out of the tax base", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await component("c1", {
      name: "Transport",
      code: "TRANSPORT",
      type: "EARNING",
      value: 3000,
      taxable: false,
    });
    await attendAll("e1");

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.totalGross).toBe(33000); // still paid
    expect(run.totalTax).toBe(1900); // but taxed on 30000, not 33000
  });

  it("taxes an allowance that is marked taxable", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await component("c1", {
      name: "Bonus",
      code: "BONUS",
      type: "EARNING",
      value: 3000,
      taxable: true,
    });
    await attendAll("e1");

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.totalTax).toBe(2200); // 150 + 10% of (33000 - 12500)
  });

  it("caps loss of pay at gross so net pay never goes negative", async () => {
    await employee("e1");
    await salary("e1", 30000);
    // No attendance at all: every working day is unexcused absence.

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.totalNet).toBe(0);
    expect(run.totalTax).toBe(0); // nothing was earned to tax
  });
});

/**
 * The ledger accrual credited Salaries Payable with gross − tax, which is not
 * what the company owes its employees: it overstated the liability by the
 * loss-of-pay charge and by every non-tax deduction, and overstated salary
 * expense to match. The entry balanced, so nothing caught it.
 */
describe.skipIf(!EMULATOR)("payroll — general ledger accrual", () => {
  beforeEach(async () => {
    cid = `gl_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({
      name: "Ledger",
      timezone: "Asia/Kabul",
      settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
    });
  });

  it("credits each liability with what is actually owed", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await component("d1", { name: "Advance", code: "ADV", type: "DEDUCTION", value: 2000 });
    await component("p1", {
      name: "Pension",
      code: "PENSION",
      type: "EMPLOYER_COST",
      value: 1500,
    });
    await attendAll("e1");

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    // gross 30000, tax on 30000 = 1900, advance 2000 → net 26100.
    expect(run.totalNet).toBe(26100);

    const entries = await payrollEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0];

    // Salaries Payable is take-home pay — not gross − tax (which was 29600).
    expect(creditOf(entry, "2100")).toBe(26100);
    expect(creditOf(entry, "2200")).toBe(1900); // tax withheld
    expect(creditOf(entry, "2300")).toBe(2000); // advance withheld
    expect(creditOf(entry, "2400")).toBe(1500); // employer contribution
    expect(debitOf(entry, "5000")).toBe(31500); // and expense equals the credits
  });

  it("posts a balanced entry", async () => {
    await employee("e1");
    await salary("e1", 30000);
    await unpaidDays("e1", 4);
    await component("d1", { name: "Advance", code: "ADV", type: "DEDUCTION", value: 1000 });

    await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    const [entry] = await payrollEntries();
    const lines = (entry.lines as Line[]) ?? [];
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
  });

  it("posts to accounts that exist in the chart", async () => {
    // A company seeded before these codes existed would otherwise accrue to
    // accounts the trial balance cannot resolve, and silently unbalance it.
    await employee("e1");
    await salary("e1", 30000);
    await component("d1", { name: "Advance", code: "ADV", type: "DEDUCTION", value: 1000 });

    await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    const [entry] = await payrollEntries();
    const codes = ((entry.lines as Line[]) ?? []).map((l) => l.accountCode);
    for (const code of codes) {
      const account = await tenant(cid, "accounts").doc(code).get();
      expect(account.exists, `account ${code} missing from the chart`).toBe(true);
    }
  });

  it("does not accrue the month twice when the run is repeated", async () => {
    await employee("e1");
    await salary("e1", 30000);
    // Somebody has to be owed something, or there is nothing to accrue.
    await attendAll("e1");

    await computePayrollRun(cid, 1405, 5, "admin", "AFN");
    await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(await payrollEntries()).toHaveLength(1);
  });
});

/**
 * Payroll used to iterate the attendanceDays documents it found. Those exist
 * only when something happened, so an employee who never came to work produced
 * none and was paid in full — while Friday and Eid, which also produce none,
 * were indistinguishable from that truancy.
 *
 * It now walks the working calendar: weekends and holidays are excluded, and a
 * working day with no record is unexcused absence.
 */
describe.skipIf(!EMULATOR)("payroll — the working calendar", () => {
  beforeEach(async () => {
    cid = `cal_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({
      name: "Calendar",
      timezone: "Asia/Kabul",
      settings: {
        profile: { currency: "AFN", timezone: "Asia/Kabul" },
        policies: { standardDailyMinutes: 480, weekendDays: [5], lateGraceMinutes: 10, overtimeEnabled: true },
      },
    });
  });

  async function holiday(date: string, name: string): Promise<void> {
    await tenant(cid, "holidays").doc(date).set({ date, name, nameEn: name, paid: true, source: "MANUAL" });
  }

  /** Marks a day present so it is not counted as absence. */
  async function present(employeeId: string, date: string): Promise<void> {
    await tenant(cid, "attendanceDays").doc(`${employeeId}_${date}`).set({
      employeeId, date, status: "PRESENT", workedMinutes: 480,
    });
  }

  it("docks an employee who never turned up at all", async () => {
    await employee("e1");
    await salary("e1", 30000);

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    // Shamsi 1405/05 is 2026-07-23..08-22: 31 days containing 5 Fridays, so 26
    // working days, none of them attended. A fully absent month costs the month.
    expect(run.payslipCount).toBe(1);
    expect(run.totalNet).toBe(0);
  });

  it("names the employees it could not pay instead of dropping them", async () => {
    // The first run a new company does is the one most likely to have people
    // with no salary yet. Omitting them silently makes the run look complete.
    await employee("e1");
    await salary("e1", 30000);
    await employee("e2"); // hired, no salary configured
    for (const d of eachWorkingDay()) {
      await present("e1", d);
      await present("e2", d);
    }

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    expect(run.payslipCount).toBe(1);
    expect(run.skippedNoSalary.map((s) => s.employeeId)).toEqual(["e2"]);
  });

  it("does not dock days that have not happened yet", async () => {
    // Payroll walks the month's expected working days, so running the month
    // that is still in progress used to charge every day from today to the end
    // of the month as unexcused absence: an employee with a clean record was
    // issued a FINALIZED payslip for roughly half their salary. A day in the
    // future is neither worked nor absent — it has not happened.
    await employee("e1");
    await salary("e1", 30000);

    const { year, month } = currentShamsiMonth();
    const today = localDateOf(new Date(), "Asia/Kabul");
    for (
      let t = new Date(`${shamsiMonthStartIso(year, month)}T00:00:00Z`).getTime();
      t <= new Date(`${today}T00:00:00Z`).getTime();
      t += 86_400_000
    ) {
      const d = new Date(t);
      if (d.getUTCDay() === 5) continue; // Friday
      await present("e1", d.toISOString().slice(0, 10));
    }

    const run = await computePayrollRun(cid, year, month, "admin", "AFN");
    const slip = (
      await tenant(cid, "payslips")
        .doc(`e1_${year}_${String(month).padStart(2, "0")}`)
        .get()
    ).data()!;

    // Every elapsed working day was attended, so nothing is owed back — and the
    // rest of the month must not be counted against them.
    expect(slip.lopDays).toBe(0);
    // Full month's pay less income tax — the same figure a clean, completed
    // month produces, not a fraction of it.
    expect(slip.net).toBe(30000 - slip.incomeTax);
  });

  it("pays in full when every working day is attended", async () => {
    await employee("e1");
    await salary("e1", 30000);
    for (const d of eachWorkingDay()) await present("e1", d);

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");

    // Gross less income tax only — no loss of pay at all.
    expect(run.totalNet).toBe(30000 - run.totalTax);
  });

  it("does not dock anyone for Friday", async () => {
    await employee("e1");
    await salary("e1", 30000);
    for (const d of eachWorkingDay()) await present("e1", d);

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");
    const slip = (await tenant(cid, "payslips").get()).docs[0].data();

    expect(slip.lopDays).toBe(0);
  });

  it("does not dock anyone for a public holiday", async () => {
    await employee("e1");
    await salary("e1", 30000);
    // Close a working Tuesday and attend everything else.
    await holiday("2026-08-04", "عید");
    for (const d of eachWorkingDay()) {
      if (d !== "2026-08-04") await present("e1", d);
    }

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");
    const slip = (await tenant(cid, "payslips").get()).docs[0].data();

    expect(slip.lopDays).toBe(0);
    expect(run.totalNet).toBe(30000 - run.totalTax);
  });

  it("still docks the one day someone missed", async () => {
    await employee("e1");
    await salary("e1", 30000);
    const days = eachWorkingDay();
    for (const d of days.slice(1)) await present("e1", d);

    const slipBefore = await computePayrollRun(cid, 1405, 5, "admin", "AFN");
    const slip = (await tenant(cid, "payslips").get()).docs[0].data();

    expect(slip.lopDays).toBe(1);
    expect(slipBefore.totalNet).toBeLessThan(30000);
  });

  it("honours a company that rests on Sunday instead", async () => {
    await db.collection("companies").doc(cid).set(
      { settings: { policies: { weekendDays: [7] } } },
      { merge: true },
    );
    await employee("e1");
    await salary("e1", 30000);
    // Attend every day that is not a Sunday.
    for (const d of allDates()) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) await present("e1", d);
    }

    const run = await computePayrollRun(cid, 1405, 5, "admin", "AFN");
    const slip = (await tenant(cid, "payslips").get()).docs[0].data();

    expect(slip.lopDays).toBe(0);
    expect(run.totalNet).toBe(30000 - run.totalTax);
  });
});

/** Every date in Shamsi 1405/05. */
function allDates(): string[] {
  const out: string[] = [];
  const end = new Date("2026-08-22T00:00:00Z").getTime();
  for (let t = new Date("2026-07-23T00:00:00Z").getTime(); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Those of them that are not a Friday. */
function eachWorkingDay(): string[] {
  return allDates().filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 5);
}
