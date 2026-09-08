import { z } from "zod";
import { ApiError } from "../lib/errors";
import { audit, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { classifyDay, eachDate, holidaySet } from "./calendar";
import { getSettings } from "./settings";
import type { Timestamp } from "firebase-admin/firestore";

/**
 * Who is doing which part of the company's work, on which day.
 *
 * Attendance answers "was he here". This answers "and what was he meant to be
 * doing" — the question a foreman on a building site is actually asked every
 * morning, and the one thing the app could not tell an employee.
 *
 * Three collections, deliberately shallow:
 *
 *   projects      what the company is building. A contract, a site, a phase.
 *   projectTeams  a named group of people. Not a department: the plastering
 *                 crew is drawn from three departments and changes next month.
 *   tasks         one piece of work, on a date range, for one or more people.
 *
 * A task is assigned to PEOPLE, never to a team. Assigning to a team expands to
 * its members at write time and stores the ids. This costs one denormalisation
 * and buys two things worth more than it: an employee's own query stays a single
 * array-contains (no second read to work out which teams he is in), and moving
 * somebody out of a team tomorrow does not silently rewrite who was responsible
 * for yesterday's work.
 *
 * Everything above the database line in this file is pure, so the scheduling
 * rules can be tested without an emulator.
 */

// --------------------------------------------------------------------- types

export const TASK_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "DONE"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The span-and-assignees shape the pure rules below need. Nothing more. */
export interface TaskSpan {
  startDate: string;
  endDate: string;
  assigneeIds: string[];
  status?: TaskStatus;
}

// ---------------------------------------------------------------- pure rules

/**
 * The people a task lands on.
 *
 * A team plus named extras is the normal case on a site — the crew, plus the
 * electrician who joins them for the day. Sorted and de-duplicated so that
 * assigning the same person twice does not make the array-contains query
 * return him twice, and so two identical assignments compare equal.
 */
export function expandAssignees(
  explicitIds: readonly string[],
  teamMemberIds: readonly string[] = [],
): string[] {
  return [...new Set([...teamMemberIds, ...explicitIds])].sort();
}

/** True when [dateIso] falls inside the task's span, endpoints included. */
export function taskRunsOn(task: TaskSpan, dateIso: string): boolean {
  return task.startDate <= dateIso && dateIso <= task.endDate;
}

/**
 * The next day somebody is actually expected in, starting the day after
 * [fromIso].
 *
 * "What am I on tomorrow" asked on a Thursday means Saturday in Afghanistan,
 * not Friday. Answering with an empty Friday would be technically correct and
 * useless — the employee would conclude he has nothing on, and find out
 * otherwise when he arrives.
 *
 * Bounded at two weeks: a company that has closed for longer has no next
 * working day worth showing.
 */
export function nextWorkingDay(
  fromIso: string,
  weekendDays: number[],
  holidays: ReadonlySet<string>,
): string | null {
  const horizon = addDays(fromIso, 14);
  for (const date of eachDate(addDays(fromIso, 1), horizon)) {
    if (classifyDay(date, weekendDays, holidays) === "WORKING") return date;
  }
  return null;
}

export function addDays(dateIso: string, days: number): string {
  const t = new Date(`${dateIso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Validates a span. Kept separate from the zod schema because zod cannot
 * express "end is not before start" without a refinement that reports against
 * the wrong field.
 */
export function assertSpan(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw ApiError.validation("The end date is before the start date", {
      endDate: "Must not be earlier than the start date",
    });
  }
  // A task spanning years is a project, not a task, and it would sit at the top
  // of every employee's day forever.
  if (eachDate(startDate, endDate).length > 366) {
    throw ApiError.validation("A task cannot span more than a year", {
      endDate: "Too far from the start date",
    });
  }
}

/**
 * Whether [employeeId] may move this task's status.
 *
 * The assignee owns the status of his own work — that is the whole point of
 * putting it on his phone. Anyone with work:write owns everything else.
 */
export function canSetStatus(
  task: { assigneeIds: string[] },
  employeeId: string,
  hasWorkWrite: boolean,
): boolean {
  return hasWorkWrite || task.assigneeIds.includes(employeeId);
}

// ------------------------------------------------------------------- schemas

export const projectWriteSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(24),
  description: z.string().max(2000).nullish(),
  branchId: z.string().min(1).max(64).nullish(),
  managerId: z.string().min(1).max(64).nullish(),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  startDate: z.string().regex(ISO_DATE).nullish(),
  endDate: z.string().regex(ISO_DATE).nullish(),
});
export type ProjectWrite = z.infer<typeof projectWriteSchema>;

export const teamWriteSchema = z.object({
  name: z.string().min(1).max(120),
  projectId: z.string().min(1).max(64).nullish(),
  leadId: z.string().min(1).max(64).nullish(),
  memberIds: z.array(z.string().min(1).max(64)).max(500).default([]),
  active: z.boolean().default(true),
});
export type TeamWrite = z.infer<typeof teamWriteSchema>;

export const taskCreateSchema = z.object({
  projectId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  detail: z.string().max(4000).nullish(),
  location: z.string().max(200).nullish(),
  startDate: z.string().regex(ISO_DATE),
  /** Omitted means a single day — the common case. */
  endDate: z.string().regex(ISO_DATE).nullish(),
  priority: z.enum(TASK_PRIORITIES).default("NORMAL"),
  /** Assign to a whole crew; expanded to its members at write time. */
  teamId: z.string().min(1).max(64).nullish(),
  /** Assign to named people, with or without a team. */
  assigneeIds: z.array(z.string().min(1).max(64)).max(500).default([]),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  status: z.enum(TASK_STATUSES).optional(),
});
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  note: z.string().max(1000).nullish(),
});

// ------------------------------------------------------------------ projects

interface ProjectDoc {
  companyId: string;
  name: string;
  code: string;
  description: string | null;
  branchId: string | null;
  managerId: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function projectToDto(id: string, d: ProjectDoc): Record<string, unknown> {
  return {
    id,
    companyId: d.companyId,
    name: d.name,
    code: d.code,
    description: d.description ?? null,
    branchId: d.branchId ?? null,
    managerId: d.managerId ?? null,
    status: d.status,
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    updatedAt: toIso(d.updatedAt),
  };
}

export async function listProjects(cid: string): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "projects").limit(300).get();
  return snap.docs
    .map((doc) => projectToDto(doc.id, doc.data() as ProjectDoc))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function createProject(
  cid: string,
  payload: ProjectWrite,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  if (payload.startDate && payload.endDate) assertSpan(payload.startDate, payload.endDate);
  const id = ulid();
  const now = nowTimestamp();
  const doc: ProjectDoc = {
    companyId: cid,
    name: payload.name,
    code: payload.code,
    description: payload.description ?? null,
    branchId: payload.branchId ?? null,
    managerId: payload.managerId ?? null,
    status: payload.status,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await tenant(cid, "projects").doc(id).create(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "projects.create",
    resourceType: "projects",
    resourceId: id,
    after: { name: doc.name, code: doc.code },
  });
  return projectToDto(id, doc);
}

export async function updateProject(
  cid: string,
  id: string,
  payload: ProjectWrite,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  if (payload.startDate && payload.endDate) assertSpan(payload.startDate, payload.endDate);
  const ref = tenant(cid, "projects").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Project not found");
  const before = snap.data() as ProjectDoc;

  const doc: ProjectDoc = {
    ...before,
    name: payload.name,
    code: payload.code,
    description: payload.description ?? null,
    branchId: payload.branchId ?? null,
    managerId: payload.managerId ?? null,
    status: payload.status,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    updatedAt: nowTimestamp(),
  };
  await ref.set(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "projects.update",
    resourceType: "projects",
    resourceId: id,
    before: { name: before.name, status: before.status },
    after: { name: doc.name, status: doc.status },
  });
  return projectToDto(id, doc);
}

/**
 * Deleting a project leaves its tasks orphaned, so it is refused while any
 * exist. Closing a project is what a finished one wants anyway — the history of
 * who built what is the reason to keep it.
 */
export async function deleteProject(
  cid: string,
  id: string,
  actorId: string,
  actorRoles: string[],
): Promise<void> {
  const open = await tenant(cid, "tasks").where("projectId", "==", id).limit(1).get();
  if (!open.empty) {
    throw ApiError.business(
      "CONFLICT",
      "This project still has work assigned to it. Mark it finished instead of deleting it.",
    );
  }
  await tenant(cid, "projects").doc(id).delete();
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "projects.delete",
    resourceType: "projects",
    resourceId: id,
  });
}

// --------------------------------------------------------------------- teams

interface TeamDoc {
  companyId: string;
  name: string;
  projectId: string | null;
  leadId: string | null;
  memberIds: string[];
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

function teamToDto(id: string, d: TeamDoc): Record<string, unknown> {
  return {
    id,
    companyId: d.companyId,
    name: d.name,
    projectId: d.projectId ?? null,
    leadId: d.leadId ?? null,
    memberIds: d.memberIds ?? [],
    active: d.active,
    updatedAt: toIso(d.updatedAt),
  };
}

export async function listTeams(cid: string): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "projectTeams").limit(300).get();
  return snap.docs
    .map((doc) => teamToDto(doc.id, doc.data() as TeamDoc))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function createTeam(
  cid: string,
  payload: TeamWrite,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  const id = ulid();
  const now = nowTimestamp();
  const doc: TeamDoc = {
    companyId: cid,
    name: payload.name,
    projectId: payload.projectId ?? null,
    leadId: payload.leadId ?? null,
    memberIds: [...new Set(payload.memberIds)].sort(),
    active: payload.active,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await tenant(cid, "projectTeams").doc(id).create(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "teams.create",
    resourceType: "projectTeams",
    resourceId: id,
    after: { name: doc.name, members: doc.memberIds.length },
  });
  return teamToDto(id, doc);
}

export async function updateTeam(
  cid: string,
  id: string,
  payload: TeamWrite,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  const ref = tenant(cid, "projectTeams").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Team not found");
  const before = snap.data() as TeamDoc;

  const doc: TeamDoc = {
    ...before,
    name: payload.name,
    projectId: payload.projectId ?? null,
    leadId: payload.leadId ?? null,
    memberIds: [...new Set(payload.memberIds)].sort(),
    active: payload.active,
    updatedAt: nowTimestamp(),
  };
  await ref.set(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "teams.update",
    resourceType: "projectTeams",
    resourceId: id,
    before: { name: before.name, members: (before.memberIds ?? []).length },
    after: { name: doc.name, members: doc.memberIds.length },
  });
  return teamToDto(id, doc);
}

/**
 * Deleting a team does NOT touch the tasks it was used to assign. Those were
 * expanded to people at write time and stay assigned to them — disbanding a
 * crew must not quietly unassign tomorrow's work.
 */
export async function deleteTeam(
  cid: string,
  id: string,
  actorId: string,
  actorRoles: string[],
): Promise<void> {
  await tenant(cid, "projectTeams").doc(id).delete();
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "teams.delete",
    resourceType: "projectTeams",
    resourceId: id,
  });
}

// --------------------------------------------------------------------- tasks

interface TaskDoc {
  companyId: string;
  projectId: string;
  projectName: string;
  title: string;
  detail: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  teamId: string | null;
  teamName: string | null;
  assigneeIds: string[];
  /**
   * Display names, snapshotted at assignment.
   *
   * The phone pulls only its own employee record, so without this an employee
   * would see a team task listing four ids he cannot read. A later rename
   * leaves an old task showing the old name, which is the correct trade for
   * work that is measured in days.
   */
  assigneeNames: string[];
  statusNote: string | null;
  completedAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function taskToDto(id: string, d: TaskDoc): Record<string, unknown> {
  return {
    id,
    companyId: d.companyId,
    projectId: d.projectId,
    projectName: d.projectName,
    title: d.title,
    detail: d.detail ?? null,
    location: d.location ?? null,
    startDate: d.startDate,
    endDate: d.endDate,
    status: d.status,
    priority: d.priority,
    teamId: d.teamId ?? null,
    teamName: d.teamName ?? null,
    assigneeIds: d.assigneeIds ?? [],
    assigneeNames: d.assigneeNames ?? [],
    statusNote: d.statusNote ?? null,
    completedAt: toIso(d.completedAt ?? null),
    updatedAt: toIso(d.updatedAt),
  };
}

/** Names for the ids, in the order given, falling back to the id itself. */
async function namesFor(cid: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const docs = await Promise.all(ids.map((id) => tenant(cid, "employees").doc(id).get()));
  return docs.map((doc, i) => {
    const d = doc.data();
    if (!d) return ids[i];
    return `${(d.firstName as string) ?? ""} ${(d.lastName as string) ?? ""}`.trim() || ids[i];
  });
}

/** Resolves teamId + explicit ids into the stored assignee list and its labels. */
async function resolveAssignment(
  cid: string,
  teamId: string | null,
  explicitIds: string[],
): Promise<{ ids: string[]; names: string[]; teamName: string | null }> {
  let teamName: string | null = null;
  let members: string[] = [];
  if (teamId) {
    const snap = await tenant(cid, "projectTeams").doc(teamId).get();
    if (!snap.exists) throw ApiError.notFound("Team not found");
    const team = snap.data() as TeamDoc;
    teamName = team.name;
    members = team.memberIds ?? [];
  }
  const ids = expandAssignees(explicitIds, members);
  if (ids.length === 0) {
    throw ApiError.validation("Assign this to somebody", {
      assigneeIds: "Choose a person or a team",
    });
  }
  return { ids, names: await namesFor(cid, ids), teamName };
}

export async function createTask(
  cid: string,
  payload: TaskCreate,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  const endDate = payload.endDate ?? payload.startDate;
  assertSpan(payload.startDate, endDate);

  const projectSnap = await tenant(cid, "projects").doc(payload.projectId).get();
  if (!projectSnap.exists) throw ApiError.notFound("Project not found");
  const project = projectSnap.data() as ProjectDoc;

  const assignment = await resolveAssignment(cid, payload.teamId ?? null, payload.assigneeIds);

  const id = ulid();
  const now = nowTimestamp();
  const doc: TaskDoc = {
    companyId: cid,
    projectId: payload.projectId,
    projectName: project.name,
    title: payload.title,
    detail: payload.detail ?? null,
    location: payload.location ?? null,
    startDate: payload.startDate,
    endDate,
    status: "PLANNED",
    priority: payload.priority,
    teamId: payload.teamId ?? null,
    teamName: assignment.teamName,
    assigneeIds: assignment.ids,
    assigneeNames: assignment.names,
    statusNote: null,
    completedAt: null,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };
  await tenant(cid, "tasks").doc(id).create(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "tasks.create",
    resourceType: "tasks",
    resourceId: id,
    after: { title: doc.title, assignees: doc.assigneeIds, startDate: doc.startDate },
  });
  return taskToDto(id, doc);
}

export async function updateTask(
  cid: string,
  id: string,
  payload: TaskUpdate,
  actorId: string,
  actorRoles: string[],
): Promise<Record<string, unknown>> {
  const ref = tenant(cid, "tasks").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Task not found");
  const before = snap.data() as TaskDoc;

  const startDate = payload.startDate ?? before.startDate;
  const endDate = payload.endDate ?? (payload.startDate ? payload.startDate : before.endDate);
  assertSpan(startDate, endDate);

  let projectId = before.projectId;
  let projectName = before.projectName;
  if (payload.projectId && payload.projectId !== before.projectId) {
    const projectSnap = await tenant(cid, "projects").doc(payload.projectId).get();
    if (!projectSnap.exists) throw ApiError.notFound("Project not found");
    projectId = payload.projectId;
    projectName = (projectSnap.data() as ProjectDoc).name;
  }

  // Re-resolve only when the assignment was actually part of this edit, so
  // renaming a task does not silently re-expand a team that has since changed.
  const reassigning = payload.teamId !== undefined || payload.assigneeIds !== undefined;
  const assignment = reassigning
    ? await resolveAssignment(
        cid,
        payload.teamId !== undefined ? payload.teamId : before.teamId,
        payload.assigneeIds ?? [],
      )
    : null;

  const status = payload.status ?? before.status;
  const doc: TaskDoc = {
    ...before,
    projectId,
    projectName,
    title: payload.title ?? before.title,
    detail: payload.detail !== undefined ? (payload.detail ?? null) : before.detail,
    location: payload.location !== undefined ? (payload.location ?? null) : before.location,
    startDate,
    endDate,
    status,
    priority: payload.priority ?? before.priority,
    teamId: assignment ? (payload.teamId ?? before.teamId ?? null) : before.teamId,
    teamName: assignment ? assignment.teamName : before.teamName,
    assigneeIds: assignment ? assignment.ids : before.assigneeIds,
    assigneeNames: assignment ? assignment.names : before.assigneeNames,
    completedAt: status === "DONE" ? (before.completedAt ?? nowTimestamp()) : null,
    updatedAt: nowTimestamp(),
  };
  await ref.set(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "tasks.update",
    resourceType: "tasks",
    resourceId: id,
    before: { title: before.title, status: before.status, assignees: before.assigneeIds },
    after: { title: doc.title, status: doc.status, assignees: doc.assigneeIds },
  });
  return taskToDto(id, doc);
}

export async function deleteTask(
  cid: string,
  id: string,
  actorId: string,
  actorRoles: string[],
): Promise<void> {
  await tenant(cid, "tasks").doc(id).delete();
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "tasks.delete",
    resourceType: "tasks",
    resourceId: id,
  });
}

/**
 * Move a task's status.
 *
 * This is the one write an ordinary employee makes here, and it is deliberately
 * the only one: he says how his own work is going, and cannot re-title it,
 * re-date it, or hand it to somebody else.
 */
export async function setTaskStatus(
  cid: string,
  id: string,
  status: TaskStatus,
  note: string | null,
  actorId: string,
  actorRoles: string[],
  hasWorkWrite: boolean,
): Promise<Record<string, unknown>> {
  const ref = tenant(cid, "tasks").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Task not found");
  const before = snap.data() as TaskDoc;

  if (!canSetStatus(before, actorId, hasWorkWrite)) {
    throw ApiError.permissionDenied("This task is not assigned to you");
  }

  const doc: TaskDoc = {
    ...before,
    status,
    statusNote: note ?? before.statusNote ?? null,
    completedAt: status === "DONE" ? (before.completedAt ?? nowTimestamp()) : null,
    updatedAt: nowTimestamp(),
  };
  await ref.set(doc);
  await audit(cid, {
    actorId,
    actorRole: actorRoles.join(","),
    action: "tasks.status",
    resourceType: "tasks",
    resourceId: id,
    before: { status: before.status },
    after: { status },
  });
  return taskToDto(id, doc);
}

// --------------------------------------------------------------------- reads

/**
 * Every task overlapping [fromIso, toIso].
 *
 * Firestore allows a range filter on one field only, so the query bounds the
 * far end (endDate >= from) and the near end is filtered here. Ordering by
 * endDate ascending puts the work finishing soonest first, which is also the
 * order a planner wants to read.
 */
export async function listTasks(
  cid: string,
  fromIso: string,
  toIso: string,
  filter: { projectId?: string; employeeId?: string } = {},
): Promise<Record<string, unknown>[]> {
  let query = tenant(cid, "tasks").where("endDate", ">=", fromIso);
  if (filter.projectId) query = query.where("projectId", "==", filter.projectId);
  if (filter.employeeId) query = query.where("assigneeIds", "array-contains", filter.employeeId);

  const snap = await query.orderBy("endDate", "asc").limit(1000).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, doc: doc.data() as TaskDoc }))
    .filter(({ doc }) => doc.startDate <= toIso)
    .map(({ id, doc }) => taskToDto(id, doc))
    .sort(
      (a, b) =>
        String(a.startDate).localeCompare(String(b.startDate)) ||
        String(a.title).localeCompare(String(b.title)),
    );
}

export interface WorkDay {
  date: string;
  /** WORKING / WEEKEND / HOLIDAY, so the app can say why a day is empty. */
  kind: string;
  tasks: Record<string, unknown>[];
}

/**
 * What one person is on today and on their next working day.
 *
 * This is the employee-facing answer, and the shape is the answer to the
 * question rather than a table dump: two named days, each carrying why it is
 * empty when it is empty.
 */
export async function myWork(
  cid: string,
  employeeId: string,
  todayIso: string,
): Promise<{ today: WorkDay; next: WorkDay | null }> {
  const settings = await getSettings(cid);
  const weekendDays = settings.policies.weekendDays;

  // Two weeks is the horizon nextWorkingDay searches; ask the calendar once for
  // the same window rather than twice.
  const horizon = addDays(todayIso, 15);
  const holidays = await holidaySet(cid, todayIso, horizon);

  const nextDate = nextWorkingDay(todayIso, weekendDays, holidays);
  const tasks = await listTasks(cid, todayIso, nextDate ?? todayIso, { employeeId });

  const dayOf = (date: string): WorkDay => ({
    date,
    kind: classifyDay(date, weekendDays, holidays),
    tasks: tasks.filter((t) =>
      taskRunsOn(t as unknown as TaskSpan, date),
    ),
  });

  return { today: dayOf(todayIso), next: nextDate ? dayOf(nextDate) : null };
}

/**
 * One day, by person — the planner's view of the same data.
 *
 * Everyone with work assigned that day, and what it is. An employee who appears
 * with nothing is not listed: this answers "who is on what", and the roster
 * already answers "who is in".
 */
export async function dayBoard(
  cid: string,
  dateIso: string,
): Promise<{ date: string; rows: { employeeId: string; name: string; tasks: Record<string, unknown>[] }[] }> {
  const tasks = await listTasks(cid, dateIso, dateIso);

  const byEmployee = new Map<string, { name: string; tasks: Record<string, unknown>[] }>();
  for (const task of tasks) {
    const ids = task.assigneeIds as string[];
    const names = task.assigneeNames as string[];
    ids.forEach((id, i) => {
      const row = byEmployee.get(id) ?? { name: names[i] ?? id, tasks: [] };
      row.tasks.push(task);
      byEmployee.set(id, row);
    });
  }

  return {
    date: dateIso,
    rows: [...byEmployee.entries()]
      .map(([employeeId, row]) => ({ employeeId, ...row }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
