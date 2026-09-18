import { describe, it, expect, beforeEach } from "vitest";
import { db, tenant, nowTimestamp } from "../lib/firestore";
import { listLeaveRequests } from "./leave";
import { listRegularizations } from "./regularization";

/**
 * The approvals queue has to agree with who is allowed to decide.
 *
 * A request is routed to `currentApproverId`, which comes from the employee's
 * managerId — and the portal's employee form has no manager field, so in a
 * company set up through the portal every request is unassigned. The decision
 * path always let an administrator decide anything; the queue only ever showed
 * requests addressed to the caller. So the administrator was told there was
 * nothing to approve while requests piled up, and unapproved leave is deducted
 * as unexcused absence — it cost employees money.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let seq = 0;

const ADMIN = ["COMPANY_ADMIN"];
const HR = ["HR_ADMIN"];
const LEAD = ["TEAM_LEAD"];

async function leaveRequest(
  id: string,
  over: Record<string, unknown> = {},
): Promise<void> {
  await tenant(cid, "leaveRequests").doc(id).set({
    companyId: cid,
    employeeId: "e_worker",
    employeeName: "Worker",
    leaveTypeId: "annual",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    startHalfDay: false,
    endHalfDay: false,
    days: 2,
    reason: "family",
    status: "PENDING",
    currentApproverId: null, // what the portal actually produces
    decidedAt: null,
    decisionNote: null,
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    ...over,
  });
}

async function correction(id: string, over: Record<string, unknown> = {}): Promise<void> {
  await tenant(cid, "regularizations").doc(id).set({
    companyId: cid,
    employeeId: "e_worker",
    date: "2026-08-03",
    reason: "forgot to check out",
    status: "PENDING",
    currentApproverId: null,
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp(),
    ...over,
  });
}

describe.skipIf(!EMULATOR)("the approvals queue", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `appr_${Date.now()}_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "Approvals Co" });
  });

  it("shows an administrator a leave request that was routed to nobody", async () => {
    await leaveRequest("lr_1");

    const seen = await listLeaveRequests(cid, "e_admin", ADMIN, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["lr_1"]);
  });

  it("shows an HR administrator the same", async () => {
    await leaveRequest("lr_1");

    const seen = await listLeaveRequests(cid, "e_hr", HR, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["lr_1"]);
  });

  it("does not show an administrator requests that are already decided", async () => {
    await leaveRequest("lr_pending");
    await leaveRequest("lr_done", { status: "APPROVED" });
    await leaveRequest("lr_no", { status: "REJECTED" });

    const seen = await listLeaveRequests(cid, "e_admin", ADMIN, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["lr_pending"]);
  });

  it("shows a team lead only what was routed to them", async () => {
    // A lead may not decide anything they were not given, so the queue must not
    // offer them work the server would refuse.
    await leaveRequest("lr_theirs", { currentApproverId: "e_lead" });
    await leaveRequest("lr_unassigned");
    await leaveRequest("lr_someone_else", { currentApproverId: "e_other" });

    const seen = await listLeaveRequests(cid, "e_lead", LEAD, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["lr_theirs"]);
  });

  it("still gives everyone their own history under the default scope", async () => {
    await leaveRequest("lr_mine", { employeeId: "e_admin", status: "APPROVED" });
    await leaveRequest("lr_theirs", { employeeId: "e_worker" });

    const seen = await listLeaveRequests(cid, "e_admin", ADMIN, "mine");
    expect(seen.map((r) => r.id)).toEqual(["lr_mine"]);
  });

  it("shows an administrator an attendance correction routed to nobody", async () => {
    await correction("rg_1");

    const seen = await listRegularizations(cid, "e_admin", ADMIN, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["rg_1"]);
  });

  it("shows a team lead only the corrections routed to them", async () => {
    await correction("rg_theirs", { currentApproverId: "e_lead" });
    await correction("rg_unassigned");

    const seen = await listRegularizations(cid, "e_lead", LEAD, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["rg_theirs"]);
  });

  it("keeps a correction queue free of decided items", async () => {
    await correction("rg_pending");
    await correction("rg_done", { status: "APPROVED" });

    const seen = await listRegularizations(cid, "e_admin", ADMIN, "approvals");
    expect(seen.map((r) => r.id)).toEqual(["rg_pending"]);
  });
});
