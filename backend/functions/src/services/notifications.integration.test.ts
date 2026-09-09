import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { db, tenant, nowTimestamp } from "../lib/firestore";
import {
  listNotifications,
  markAllRead,
  markRead,
  notify,
  notifyAll,
  unreadCount,
} from "./notifications";

/**
 * Telling somebody something happened.
 *
 * The important property is not that a notification is written — it is that
 * failing to write one never breaks whatever caused it. Approving leave is the
 * act that matters; telling the employee is not, and an approval that gets
 * refused because we could not send a message is worse in every case than an
 * approval nobody was told about.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let cid = "";
let seq = 0;

beforeEach(() => {
  seq += 1;
  cid = `nt_${Date.now()}_${seq}`;
});

afterEach(async () => {
  await db.recursiveDelete(db.collection("companies").doc(cid));
  vi.restoreAllMocks();
});

describe.skipIf(!EMULATOR)("notifications", () => {
  it("reaches the person it is addressed to", async () => {
    await notify(cid, {
      employeeId: "e1",
      kind: "LEAVE_DECIDED",
      title: "رخصتی شما تأیید شد",
      body: "از ۱۴۰۵-۰۶-۲۰ تا ۱۴۰۵-۰۶-۲۲",
      link: "/leave",
    });

    const items = await listNotifications(cid, "e1");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("رخصتی شما تأیید شد");
    expect(items[0].read).toBe(false);
    expect(items[0].link).toBe("/leave");
  });

  it("does not show one person another person's news", async () => {
    await notify(cid, { employeeId: "e1", kind: "PAYSLIP_READY", title: "a", body: "b" });

    expect(await listNotifications(cid, "e2")).toEqual([]);
    expect(await unreadCount(cid, "e2")).toBe(0);
  });

  it("counts only what is unread", async () => {
    await notifyAll(cid, ["e1", "e1", "e2"], { kind: "PAYSLIP_READY", title: "a", body: "b" });

    // e1 appears twice in the list and gets one notification: telling somebody
    // the same thing twice is a bug, not thoroughness.
    expect(await unreadCount(cid, "e1")).toBe(1);
    expect(await unreadCount(cid, "e2")).toBe(1);
  });

  it("marks one as read", async () => {
    await notify(cid, { employeeId: "e1", kind: "PAYSLIP_READY", title: "a", body: "b" });
    const [item] = await listNotifications(cid, "e1");

    await markRead(cid, "e1", item.id as string);

    expect(await unreadCount(cid, "e1")).toBe(0);
    expect((await listNotifications(cid, "e1"))[0].read).toBe(true);
  });

  it("refuses to mark somebody else's as read", async () => {
    // A notification is addressed to a person. Marking another's read by
    // guessing an id is not a thing anybody should be able to do.
    await notify(cid, { employeeId: "e1", kind: "PAYSLIP_READY", title: "a", body: "b" });
    const [item] = await listNotifications(cid, "e1");

    await expect(markRead(cid, "e2", item.id as string)).rejects.toThrow();
    expect(await unreadCount(cid, "e1")).toBe(1);
  });

  it("marks everything of the caller's, and nothing of anybody else's", async () => {
    await notifyAll(cid, ["e1", "e2"], { kind: "PAYSLIP_READY", title: "a", body: "b" });
    await notify(cid, { employeeId: "e1", kind: "LEAVE_DECIDED", title: "c", body: "d" });

    const marked = await markAllRead(cid, "e1");

    expect(marked).toBe(2);
    expect(await unreadCount(cid, "e1")).toBe(0);
    expect(await unreadCount(cid, "e2")).toBe(1);
  });

  it("writes numbers in the script the text is written in", async () => {
    // "دورهٔ 1405/06" among Dari prose where every other number is ۱۴۰۵ reads
    // as a rendering fault — which is how it looked the first time the bell
    // was opened in a browser.
    await notify(cid, {
      employeeId: "e1",
      kind: "PAYSLIP_READY",
      title: "فیش معاش شما آماده است",
      body: "دورهٔ 1405/06",
    });

    const [item] = await listNotifications(cid, "e1");
    expect(item.body).toBe("دورهٔ ۱۴۰۵/۰۶");
    expect(String(item.body)).not.toMatch(/[0-9]/);
  });

  it("replaces rather than repeats when given a key", async () => {
    // Payroll is deliberately re-runnable. Without this, four runs of one
    // month sent every employee four identical "your payslip is ready".
    for (let i = 0; i < 4; i += 1) {
      await notify(cid, {
        employeeId: "e1",
        kind: "PAYSLIP_READY",
        title: "فیش معاش شما آماده است",
        body: `دورهٔ ۱۴۰۵/۰۶ — اجرای ${i}`,
        dedupeKey: "payslip_1405_06",
      });
    }

    const items = await listNotifications(cid, "e1");
    expect(items).toHaveLength(1);
    // The last run's text, not the first: the numbers may have changed.
    expect(String(items[0].body)).toContain("۳");
  });

  it("keeps one person's keyed notification apart from another's", async () => {
    await notify(cid, { employeeId: "e1", kind: "PAYSLIP_READY", title: "a", body: "b", dedupeKey: "k" });
    await notify(cid, { employeeId: "e2", kind: "PAYSLIP_READY", title: "a", body: "b", dedupeKey: "k" });

    expect(await unreadCount(cid, "e1")).toBe(1);
    expect(await unreadCount(cid, "e2")).toBe(1);
  });

  it("returns the newest first", async () => {
    await notify(cid, { employeeId: "e1", kind: "PAYSLIP_READY", title: "older", body: "" });
    await new Promise((r) => setTimeout(r, 25));
    await notify(cid, { employeeId: "e1", kind: "LEAVE_DECIDED", title: "newer", body: "" });

    const items = await listNotifications(cid, "e1");
    expect(items.map((i) => i.title)).toEqual(["newer", "older"]);
  });

  it("swallows its own failure rather than raising it at the caller", async () => {
    // THE property. The caller is in the middle of approving leave, and an
    // approval refused because a message could not be written is worse than an
    // approval nobody was told about.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = vi.spyOn(db, "collection").mockImplementation(() => {
      throw new Error("firestore is having a day");
    });

    await expect(
      notify(cid, { employeeId: "e1", kind: "LEAVE_DECIDED", title: "a", body: "b" }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    boom.mockRestore();
  });
});

describe.skipIf(!EMULATOR)("a leave decision tells the employee", () => {
  it("writes a notification the employee can see", async () => {
    // Exercised through the real service rather than by calling notify() here,
    // because the thing worth testing is that the decision path calls it at
    // all — that is what was missing.
    const { decideLeaveRequest } = await import("./leave");

    await db.collection("companies").doc(cid).set({ name: "N" });
    await tenant(cid, "leaveRequests").doc("r1").set({
      companyId: cid,
      employeeId: "e_worker",
      employeeName: "Worker",
      leaveTypeId: "annual",
      startDate: "1405-06-20",
      endDate: "1405-06-22",
      days: 3,
      reason: null,
      status: "PENDING",
      currentApproverId: "e_admin",
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp(),
    });

    await decideLeaveRequest(cid, "r1", "e_admin", ["HR_ADMIN"], "REJECT", "تیم کم است");

    const items = await listNotifications(cid, "e_worker");
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("LEAVE_DECIDED");
    expect(String(items[0].title)).toContain("رد شد");
    // The reason travels with it: "rejected" without a why sends the employee
    // to find their manager, which is the conversation this replaces.
    expect(items[0].body).toBe("تیم کم است");
  });
});
