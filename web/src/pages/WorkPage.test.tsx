import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { MyWork, Project, WorkTask, WorkTeam } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

/**
 * The work page.
 *
 * Two behaviours here are load-bearing and neither is obvious from the markup:
 * a plain employee must land on their own work and be offered nothing else,
 * and editing a task without touching the crew must not send an assignment —
 * doing so would silently re-expand a team that has changed since.
 */

const saveCalls = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));
const statusCalls = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));
const roles = vi.hoisted(() => ({ current: ["HR_ADMIN"] as string[] }));
const tasks = vi.hoisted(() => ({ current: [] as WorkTask[] }));
const mine = vi.hoisted(() => ({ current: null as MyWork | null }));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { displayName: "Yusuf Karimi", companyName: "Kabul Construction" } }),
  useHasPermission: () => (permission: string) => {
    if (roles.current.includes("HR_ADMIN")) {
      return ["work:read", "work:write", "self:tasks"].includes(permission);
    }
    return permission === "self:tasks";
  },
}));

const project: Project = {
  id: "p1",
  companyId: "c1",
  name: "Darulaman Tower",
  code: "DT",
  description: null,
  branchId: null,
  managerId: null,
  status: "ACTIVE",
  startDate: null,
  endDate: null,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const team: WorkTeam = {
  id: "t1",
  companyId: "c1",
  name: "Concrete crew",
  projectId: null,
  leadId: null,
  memberIds: ["e_ali", "e_omar"],
  active: true,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function task(over: Partial<WorkTask> = {}): WorkTask {
  return {
    id: "k1",
    companyId: "c1",
    projectId: "p1",
    projectName: "Darulaman Tower",
    title: "Pour the third-floor slab",
    detail: null,
    location: "Block B",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    status: "PLANNED",
    priority: "NORMAL",
    teamId: "t1",
    teamName: "Concrete crew",
    assigneeIds: ["e_ali", "e_omar"],
    assigneeNames: ["Ali Rahimi", "Omar Nazari"],
    statusNote: null,
    completedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

vi.mock("../api/hooks", () => ({
  useProjects: () => ({ data: [project], isLoading: false, isError: false }),
  useWorkTeams: () => ({ data: [team], isLoading: false, isError: false }),
  useEmployees: () => ({
    data: {
      data: [
        { id: "e_ali", firstName: "Ali", lastName: "Rahimi" },
        { id: "e_omar", firstName: "Omar", lastName: "Nazari" },
        { id: "e_spark", firstName: "Fatima", lastName: "Sadat" },
      ],
    },
    isLoading: false,
  }),
  useWorkTasks: () => ({ data: tasks.current, isLoading: false, isError: false }),
  useDayBoard: () => ({
    data: {
      date: "2026-09-07",
      rows: [{ employeeId: "e_ali", name: "Ali Rahimi", tasks: tasks.current }],
    },
    isLoading: false,
    isError: false,
  }),
  useMyWork: () => ({ data: mine.current, isLoading: false, isError: false }),
  useSaveTask: () => ({
    mutateAsync: vi.fn(async (a: Record<string, unknown>) => {
      saveCalls.current.push(a);
    }),
    isPending: false,
  }),
  useDeleteTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveWorkTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWorkTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetTaskStatus: () => ({
    mutateAsync: vi.fn(async (a: Record<string, unknown>) => {
      statusCalls.current.push(a);
    }),
    isPending: false,
  }),
}));

const { WorkPage } = await import("./WorkPage");

function renderPage(): void {
  render(<LocaleProvider>{(<WorkPage />) as ReactNode}</LocaleProvider>);
}

beforeEach(() => {
  saveCalls.current = [];
  statusCalls.current = [];
  roles.current = ["HR_ADMIN"];
  tasks.current = [task()];
  mine.current = {
    today: { date: "2026-09-07", kind: "WORKING", tasks: [task()] },
    next: { date: "2026-09-08", kind: "WORKING", tasks: [] },
  };
});

describe("what each role is shown", () => {
  it("opens a planner on the day board", async () => {
    renderPage();
    expect(await screen.findByText("چه کسی روی چه کاری است")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "پروژه‌ها" })).toBeInTheDocument();
  });

  it("opens a plain employee straight on their own work, and offers nothing else", async () => {
    roles.current = ["EMPLOYEE"];
    renderPage();

    expect(await screen.findByText("کار شما")).toBeInTheDocument();
    // No planning tabs at all: what the rest of the company is doing is not
    // theirs to browse, and the server would refuse the call anyway.
    expect(screen.queryByRole("tab", { name: "پروژه‌ها" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "تیم‌ها" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "کار امروز" })).not.toBeInTheDocument();
  });
});

describe("my work", () => {
  beforeEach(() => {
    roles.current = ["EMPLOYEE"];
  });

  it("names today's job, its project and who else is on it", async () => {
    renderPage();
    expect(await screen.findByText("Pour the third-floor slab")).toBeInTheDocument();
    expect(screen.getByText(/Darulaman Tower/)).toBeInTheDocument();
    expect(screen.getByText(/Ali Rahimi، Omar Nazari/)).toBeInTheDocument();
  });

  it("says why a day is empty instead of showing a blank", async () => {
    mine.current = {
      today: { date: "2026-09-11", kind: "WEEKEND", tasks: [] },
      next: { date: "2026-09-12", kind: "WORKING", tasks: [] },
    };
    renderPage();
    expect(await screen.findByText("این روز رخصتی هفته‌وار است.")).toBeInTheDocument();
    expect(screen.getByText("برای این روز کاری به شما تعیین نشده.")).toBeInTheDocument();
  });

  it("labels the second day as the next working day, not 'tomorrow'", async () => {
    // It is Saturday when asked on a Thursday. Calling it tomorrow would be a
    // lie the employee acts on.
    renderPage();
    expect(await screen.findByText("روز کاری بعد")).toBeInTheDocument();
  });

  it("reports progress on the employee's own task", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "شروع کردم" }));
    expect(statusCalls.current).toEqual([{ id: "k1", status: "IN_PROGRESS" }]);
  });

  it("offers nothing to start on a task already finished", async () => {
    mine.current = {
      today: { date: "2026-09-07", kind: "WORKING", tasks: [task({ status: "DONE" })] },
      next: null,
    };
    renderPage();
    await screen.findByText("انجام شد");
    expect(screen.queryByRole("button", { name: "شروع کردم" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تمام شد" })).not.toBeInTheDocument();
  });
});

describe("assigning work", () => {
  async function openPlanEdit(): Promise<void> {
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "برنامه" }));
    await userEvent.click(await screen.findByRole("button", { name: "ویرایش" }));
  }

  it("does not send an assignment when the edit never touched the crew", async () => {
    // The server only re-expands a team when the assignment was part of the
    // edit. Sending an empty one here would strip everybody off the task.
    await openPlanEdit();
    const dialog = screen.getByText("ویرایش", { selector: "h2" }).closest(".modal") as HTMLElement;
    await userEvent.clear(within(dialog).getByLabelText("کار"));
    await userEvent.type(within(dialog).getByLabelText("کار"), "Slab pour, third floor");
    await userEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    expect(saveCalls.current).toHaveLength(1);
    const body = saveCalls.current[0].body as Record<string, unknown>;
    expect(body.title).toBe("Slab pour, third floor");
    expect(body).not.toHaveProperty("assigneeIds");
    expect(body).not.toHaveProperty("teamId");
  });

  it("sends the assignment when the crew was actually changed", async () => {
    await openPlanEdit();
    const dialog = screen.getByText("ویرایش", { selector: "h2" }).closest(".modal") as HTMLElement;
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Fatima Sadat/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    const body = saveCalls.current[0].body as Record<string, unknown>;
    expect(body.assigneeIds).toEqual(["e_spark"]);
    expect(body.teamId).toBe("t1");
  });

  it("sends a new individual assignment with no team", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "تعیین کار" }));
    const dialog = screen.getByText("تعیین کار", { selector: "h2" }).closest(".modal") as HTMLElement;

    await userEvent.selectOptions(within(dialog).getByLabelText("پروژه"), "p1");
    await userEvent.type(within(dialog).getByLabelText("کار"), "Run the site power");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Fatima Sadat/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    const call = saveCalls.current[0];
    expect(call.id).toBeUndefined();
    const body = call.body as Record<string, unknown>;
    expect(body.projectId).toBe("p1");
    expect(body.assigneeIds).toEqual(["e_spark"]);
    expect(body.teamId).toBeNull();
    // Left blank, the end date stays absent so the server makes it a single day.
    expect(body.endDate).toBeNull();
  });

  it("will not save a task with no project or no title", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "تعیین کار" }));
    const dialog = screen.getByText("تعیین کار", { selector: "h2" }).closest(".modal") as HTMLElement;
    expect(within(dialog).getByRole("button", { name: "ذخیره" })).toBeDisabled();

    await userEvent.selectOptions(within(dialog).getByLabelText("پروژه"), "p1");
    expect(within(dialog).getByRole("button", { name: "ذخیره" })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText("کار"), "Something");
    expect(within(dialog).getByRole("button", { name: "ذخیره" })).toBeEnabled();
  });
});
