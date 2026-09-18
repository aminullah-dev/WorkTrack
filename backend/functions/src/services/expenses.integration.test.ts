import { describe, it, expect, beforeEach } from "vitest";
import { db, tenant } from "../lib/firestore";
import { createExpense, decideExpense } from "./expenses";

/**
 * Approving or paying an expense used to be a read-modify-write across separate
 * round trips, with the ledger entry posted afterwards under a random id. Two
 * approvers could both pass the status guard and both post, double-relieving
 * Accounts Payable; and a failure between the two writes left an expense marked
 * decided with nothing in the ledger and no way to retry, because the state
 * machine rejects a second attempt.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let seq = 0;

async function draft(amount = 5000): Promise<string> {
  const expense = await createExpense(
    cid,
    {
      category: "services",
      vendor: "Kabul Supplies",
      description: "Monthly service",
      amount,
      currency: "AFN",
      date: "2026-08-01",
    },
    "admin",
  );
  return expense.id;
}

async function entries(): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "journalEntries").where("source", "==", "EXPENSE").get();
  return snap.docs.map((d) => d.data() as Record<string, unknown>);
}

describe.skipIf(!EMULATOR)("expense decisions", () => {
  beforeEach(async () => {
    cid = `exp_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({
      name: "Expenses",
      timezone: "Asia/Kabul",
      settings: { profile: { currency: "AFN", timezone: "Asia/Kabul" } },
    });
  });

  it("posts one ledger entry when an expense is approved", async () => {
    const id = await draft();

    const result = await decideExpense(cid, id, "APPROVE", "admin");

    expect(result.status).toBe("APPROVED");
    expect(await entries()).toHaveLength(1);
  });

  it("settles Accounts Payable exactly once when two approvers pay at the same time", async () => {
    const id = await draft();
    await decideExpense(cid, id, "APPROVE", "admin");

    const [a, b] = await Promise.allSettled([
      decideExpense(cid, id, "PAY", "finance-1"),
      decideExpense(cid, id, "PAY", "finance-2"),
    ]);

    // One wins; the other loses the race and is refused by the state machine.
    const settled = [a, b].filter((r) => r.status === "fulfilled");
    expect(settled).toHaveLength(1);

    // One approval entry + one payment entry. Two payments would relieve the
    // payable twice and credit Bank twice for money that left once.
    const posted = await entries();
    expect(posted).toHaveLength(2);
    const payments = posted.filter((e) => String(e.memo).startsWith("Payment:"));
    expect(payments).toHaveLength(1);
  });

  it("leaves the expense undecided when its ledger entry cannot be posted", async () => {
    // A zero-amount entry is rejected by the journal. The status write and the
    // ledger write are one transaction, so neither lands.
    const id = await draft(0);

    await expect(decideExpense(cid, id, "APPROVE", "admin")).rejects.toThrow();

    const after = await tenant(cid, "expenses").doc(id).get();
    expect(after.data()?.status).toBe("DRAFT");
    expect(await entries()).toHaveLength(0);
  });

  it("refuses to pay an expense that was never approved", async () => {
    const id = await draft();

    await expect(decideExpense(cid, id, "PAY", "admin")).rejects.toThrow();
    expect(await entries()).toHaveLength(0);
  });
});
