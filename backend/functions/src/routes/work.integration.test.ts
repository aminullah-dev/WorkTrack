import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../lib/firestore";

/**
 * Work assignment end to end.
 *
 * The questions worth asking of a database here are the ones the pure tests
 * cannot: does a team assignment reach the right people's phones, can an
 * employee only touch his own work, and does one company's plan stay invisible
 * to another.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const token = vi.hoisted(() => ({ claims: {} as Record<string, unknown> }));
vi.mock("firebase-admin/auth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    getAuth: () => ({
      verifyIdToken: async () => {
        if (!token.claims.uid) throw new Error("no token");
        return token.claims;
      },
    }),
  };
});

const { createApp } = await import("../app");
const app = createApp();

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  } finally {
    server.close();
  }
}

let cid = "";
let seq = 0;

const asLead = () => ({ uid: "u_lead", cid, eid: "e_lead", r: ["TEAM_LEAD"], email_verified: true });
const asWorker = (eid: string) => ({
  uid: `u_${eid}`,
  cid,
  eid,
  r: ["EMPLOYEE"],
  email_verified: true,
});

/** A Sunday, so "next working day" is an ordinary tomorrow unless a test says otherwise. */
const TODAY = "2026-09-06";

async function seedCompany(): Promise<void> {
  await db.collection("companies").doc(cid).set({
    name: "Kabul Construction",
    settings: { policies: { weekendDays: [5] }, profile: { timezone: "Asia/Kabul" } },
  });
  const people: [string, string, string][] = [
    ["e_lead", "Yusuf", "Karimi"],
    ["e_ali", "Ali", "Rahimi"],
    ["e_omar", "Omar", "Nazari"],
    ["e_spark", "Fatima", "Sadat"],
  ];
  await Promise.all(
    people.map(([id, firstName, lastName]) =>
      db.collection("companies").doc(cid).collection("employees").doc(id).set({
        firstName,
        lastName,
        status: "ACTIVE",
      }),
    ),
  );
}

async function makeProject(): Promise<string> {
  const res = await request("POST", "/v1/work/projects", {
    name: "Darulaman Tower",
    code: "DT",
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function makeTeam(memberIds: string[]): Promise<string> {
  const res = await request("POST", "/v1/work/teams", { name: "Concrete crew", memberIds });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describe.skipIf(!EMULATOR)("work assignment", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `work_${Date.now()}_${seq}`;
    await seedCompany();
    token.claims = asLead();
  });

  it("assigning a crew puts the task on every member's day", async () => {
    const projectId = await makeProject();
    const teamId = await makeTeam(["e_ali", "e_omar"]);

    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      teamId,
      title: "Pour the third-floor slab",
      startDate: TODAY,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.assigneeIds).toEqual(["e_ali", "e_omar"]);
    // The phone pulls only its own employee row, so the names travel with it.
    expect(created.body.data.assigneeNames).toEqual(["Ali Rahimi", "Omar Nazari"]);
    expect(created.body.data.teamName).toBe("Concrete crew");
    // Omitting the end date means one day, not an open-ended task.
    expect(created.body.data.endDate).toBe(TODAY);

    for (const eid of ["e_ali", "e_omar"]) {
      token.claims = asWorker(eid);
      const mine = await request("GET", `/v1/work/mine?date=${TODAY}`);
      expect(mine.status).toBe(200);
      expect(mine.body.data.today.tasks).toHaveLength(1);
      expect(mine.body.data.today.tasks[0].title).toBe("Pour the third-floor slab");
      expect(mine.body.data.today.tasks[0].projectName).toBe("Darulaman Tower");
    }

    token.claims = asWorker("e_spark");
    const notMine = await request("GET", `/v1/work/mine?date=${TODAY}`);
    expect(notMine.body.data.today.tasks).toHaveLength(0);
  });

  it("keeps an individual assignment individual", async () => {
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_spark"],
      title: "Run the site power",
      startDate: TODAY,
    });

    token.claims = asWorker("e_spark");
    expect((await request("GET", `/v1/work/mine?date=${TODAY}`)).body.data.today.tasks).toHaveLength(1);
    token.claims = asWorker("e_ali");
    expect((await request("GET", `/v1/work/mine?date=${TODAY}`)).body.data.today.tasks).toHaveLength(0);
  });

  it("a crew plus one extra man reaches all three", async () => {
    const projectId = await makeProject();
    const teamId = await makeTeam(["e_ali", "e_omar"]);
    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      teamId,
      assigneeIds: ["e_spark"],
      title: "Slab pour with the electrician",
      startDate: TODAY,
    });
    expect(created.body.data.assigneeIds).toEqual(["e_ali", "e_omar", "e_spark"]);
  });

  it("shows a multi-day task on every day it runs", async () => {
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Rebar, second floor",
      startDate: "2026-09-06",
      endDate: "2026-09-09",
    });

    token.claims = asWorker("e_ali");
    for (const date of ["2026-09-06", "2026-09-07", "2026-09-09"]) {
      const res = await request("GET", `/v1/work/mine?date=${date}`);
      expect(res.body.data.today.tasks).toHaveLength(1);
    }
    const after = await request("GET", "/v1/work/mine?date=2026-09-10");
    expect(after.body.data.today.tasks).toHaveLength(0);
  });

  it("answers Thursday's 'what about tomorrow' with Saturday", async () => {
    // The whole point of the second day being computed rather than +1: Friday
    // is the Afghan weekend, and an empty Friday would read as "nothing on".
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Saturday's shuttering",
      startDate: "2026-09-12", // Saturday
    });

    token.claims = asWorker("e_ali");
    const res = await request("GET", "/v1/work/mine?date=2026-09-10"); // Thursday
    expect(res.body.data.next.date).toBe("2026-09-12");
    expect(res.body.data.next.kind).toBe("WORKING");
    expect(res.body.data.next.tasks[0].title).toBe("Saturday's shuttering");
  });

  it("says why today is empty when the company is closed", async () => {
    token.claims = asWorker("e_ali");
    const res = await request("GET", "/v1/work/mine?date=2026-09-11"); // a Friday
    expect(res.body.data.today.kind).toBe("WEEKEND");
    expect(res.body.data.today.tasks).toEqual([]);
  });

  it("lets the man doing the work report on it, and nobody else", async () => {
    const projectId = await makeProject();
    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Formwork",
      startDate: TODAY,
    });
    const taskId = created.body.data.id;

    token.claims = asWorker("e_omar");
    const stranger = await request("POST", `/v1/work/tasks/${taskId}/status`, {
      status: "DONE",
    });
    expect(stranger.status).toBe(403);

    token.claims = asWorker("e_ali");
    const mine = await request("POST", `/v1/work/tasks/${taskId}/status`, {
      status: "DONE",
      note: "Finished before lunch",
    });
    expect(mine.status).toBe(200);
    expect(mine.body.data.status).toBe("DONE");
    expect(mine.body.data.completedAt).not.toBeNull();
    expect(mine.body.data.statusNote).toBe("Finished before lunch");
  });

  it("does not let an employee re-plan the work he was given", async () => {
    const projectId = await makeProject();
    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Formwork",
      startDate: TODAY,
    });

    token.claims = asWorker("e_ali");
    // Not his to re-title, re-date, or hand to somebody else.
    expect(
      (await request("PATCH", `/v1/work/tasks/${created.body.data.id}`, { title: "Tea break" }))
        .status,
    ).toBe(403);
    // Nor to browse what the rest of the company is doing.
    expect((await request("GET", `/v1/work/tasks?from=${TODAY}`)).status).toBe(403);
    expect((await request("GET", `/v1/work/board?date=${TODAY}`)).status).toBe(403);
    expect((await request("POST", "/v1/work/projects", { name: "Mine", code: "M" })).status).toBe(403);
  });

  it("reopening a finished task clears the time it was finished", async () => {
    const projectId = await makeProject();
    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Formwork",
      startDate: TODAY,
    });
    const taskId = created.body.data.id;
    await request("POST", `/v1/work/tasks/${taskId}/status`, { status: "DONE" });

    const reopened = await request("POST", `/v1/work/tasks/${taskId}/status`, {
      status: "IN_PROGRESS",
    });
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it("groups a day by person for the planner", async () => {
    const projectId = await makeProject();
    const teamId = await makeTeam(["e_ali", "e_omar"]);
    await request("POST", "/v1/work/tasks", {
      projectId,
      teamId,
      title: "Slab pour",
      startDate: TODAY,
    });
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Second job",
      startDate: TODAY,
    });

    const board = await request("GET", `/v1/work/board?date=${TODAY}`);
    expect(board.status).toBe(200);
    const rows = board.body.data.rows as { employeeId: string; name: string; tasks: unknown[] }[];
    expect(rows.map((r) => r.employeeId).sort()).toEqual(["e_ali", "e_omar"]);
    expect(rows.find((r) => r.employeeId === "e_ali")!.tasks).toHaveLength(2);
    expect(rows.find((r) => r.employeeId === "e_omar")!.name).toBe("Omar Nazari");
    // Nobody with nothing on is listed: this answers "who is on what".
    expect(rows.some((r) => r.employeeId === "e_spark")).toBe(false);
  });

  it("keeps one company's plan out of another's", async () => {
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Ours",
      startDate: TODAY,
    });

    const otherCid = `${cid}_other`;
    token.claims = { uid: "u_x", cid: otherCid, eid: "e_ali", r: ["TEAM_LEAD"], email_verified: true };
    expect((await request("GET", "/v1/work/projects")).body.data).toEqual([]);
    expect((await request("GET", `/v1/work/tasks?from=${TODAY}`)).body.data).toEqual([]);
    // Same employee id, different tenant: still nothing.
    expect((await request("GET", `/v1/work/mine?date=${TODAY}`)).body.data.today.tasks).toEqual([]);
  });

  it("refuses a task with nobody on it", async () => {
    const projectId = await makeProject();
    const res = await request("POST", "/v1/work/tasks", {
      projectId,
      title: "Somebody do this",
      startDate: TODAY,
    });
    expect(res.status).toBe(422);
  });

  it("refuses a task against a project that does not exist", async () => {
    const res = await request("POST", "/v1/work/tasks", {
      projectId: "no_such_project",
      assigneeIds: ["e_ali"],
      title: "Ghost",
      startDate: TODAY,
    });
    expect(res.status).toBe(404);
  });

  it("will not delete a project that still has work on it", async () => {
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Live work",
      startDate: TODAY,
    });
    const res = await request("DELETE", `/v1/work/projects/${projectId}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("disbanding a crew leaves tomorrow's work assigned", async () => {
    // The task was expanded to people when it was written. Deleting the team it
    // came from must not quietly unassign work somebody is expecting to do.
    const projectId = await makeProject();
    const teamId = await makeTeam(["e_ali", "e_omar"]);
    await request("POST", "/v1/work/tasks", {
      projectId,
      teamId,
      title: "Slab pour",
      startDate: TODAY,
    });
    expect((await request("DELETE", `/v1/work/teams/${teamId}`)).status).toBe(204);

    token.claims = asWorker("e_ali");
    expect((await request("GET", `/v1/work/mine?date=${TODAY}`)).body.data.today.tasks).toHaveLength(1);
  });

  it("renaming a task does not re-expand a crew that has since changed", async () => {
    const projectId = await makeProject();
    const teamId = await makeTeam(["e_ali", "e_omar"]);
    const created = await request("POST", "/v1/work/tasks", {
      projectId,
      teamId,
      title: "Slab pour",
      startDate: TODAY,
    });
    // Omar moves off the crew tomorrow. Yesterday's work stays his.
    await request("PUT", `/v1/work/teams/${teamId}`, {
      name: "Concrete crew",
      memberIds: ["e_ali"],
    });
    const renamed = await request("PATCH", `/v1/work/tasks/${created.body.data.id}`, {
      title: "Slab pour, third floor",
    });
    expect(renamed.body.data.assigneeIds).toEqual(["e_ali", "e_omar"]);

    // Re-assigning on purpose does pick up the new crew.
    const reassigned = await request("PATCH", `/v1/work/tasks/${created.body.data.id}`, {
      teamId,
    });
    expect(reassigned.body.data.assigneeIds).toEqual(["e_ali"]);
  });

  it("delivers a task to the phone through the sync pull it is scoped for", async () => {
    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Rebar",
      startDate: TODAY,
    });

    token.claims = asWorker("e_ali");
    const mine = await request("GET", "/v1/sync/pull?type=tasks");
    expect(mine.body.data.items).toHaveLength(1);
    expect(mine.body.data.items[0].title).toBe("Rebar");
    // Projects are reference data, so the phone can name what it is working on.
    expect((await request("GET", "/v1/sync/pull?type=projects")).body.data.items).toHaveLength(1);

    token.claims = asWorker("e_spark");
    expect((await request("GET", "/v1/sync/pull?type=tasks")).body.data.items).toEqual([]);
  });

  it("reaches an employee in a browser even when the licence enforces devices", async () => {
    // The case this used to break: a portal request carries no X-Device-Id,
    // and the guard used to answer every one of them with "this device is not
    // activated, sign in again" — at exactly the companies paying for
    // enforcement. The licence counts phones running the app; a browser is not
    // one of them.
    const { setLicense } = await import("../services/license");
    const { clearDeviceGuardCache } = await import("../middleware/deviceGuard");
    await setLicense(cid, {
      plan: "STANDARD",
      deviceLimit: 5,
      status: "ACTIVE",
      expiresAt: null,
      enforceDevices: true,
    } as Parameters<typeof setLicense>[1]);
    clearDeviceGuardCache();

    const projectId = await makeProject();
    await request("POST", "/v1/work/tasks", {
      projectId,
      assigneeIds: ["e_ali"],
      title: "Visible from a browser",
      startDate: TODAY,
    });

    token.claims = asWorker("e_ali");
    const res = await request("GET", `/v1/work/mine?date=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.data.today.tasks[0].title).toBe("Visible from a browser");

    // And it took no seat doing so.
    const devices = await db.collection("companies").doc(cid).collection("devices").get();
    expect(devices.size).toBe(0);
  });

  it("is closed to anyone without a token", async () => {
    token.claims = {};
    expect((await request("GET", "/v1/work/mine")).status).toBe(401);
    expect((await request("GET", "/v1/work/tasks")).status).toBe(401);
  });
});
