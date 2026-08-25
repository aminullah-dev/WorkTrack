import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { computePayrollRun } from "./payroll";

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
