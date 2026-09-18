import { Router } from "express";
import { ApiError, asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import { hasPermission, requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { localDateOf } from "../services/attendance";
import { getSettings } from "../services/settings";
import {
  createProject,
  createTask,
  createTeam,
  dayBoard,
  deleteProject,
  deleteTask,
  deleteTeam,
  listProjects,
  listTasks,
  listTeams,
  myWork,
  projectWriteSchema,
  setTaskStatus,
  taskCreateSchema,
  taskStatusSchema,
  taskUpdateSchema,
  teamWriteSchema,
  updateProject,
  updateTask,
  updateTeam,
} from "../services/work";

/**
 * Work assignment: projects, crews, and who is on what on a given day.
 *
 * Two audiences share this router and they are not the same shape. A planner
 * asks about a date range and gets tasks; an employee asks nothing and gets
 * today and his next working day, already worked out. The employee route is the
 * one the phone calls, and it is the reason this feature exists.
 */
export const workRouter = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: unknown, field: string): string {
  const s = String(value ?? "");
  if (!ISO_DATE.test(s)) {
    throw ApiError.validation(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return s;
}

/** Today where the company is, not where the server is. */
async function todayFor(cid: string): Promise<string> {
  const settings = await getSettings(cid);
  return localDateOf(new Date(), settings.profile.timezone);
}

// ------------------------------------------------------------------ projects

workRouter.get(
  "/projects",
  requirePermission("work:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listProjects(auth.companyId) });
  }),
);

workRouter.post(
  "/projects",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, projectWriteSchema);
    const dto = await createProject(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: dto });
  }),
);

workRouter.put(
  "/projects/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, projectWriteSchema);
    const dto = await updateProject(
      auth.companyId,
      req.params.id,
      payload,
      auth.employeeId,
      auth.roles,
    );
    res.json({ data: dto });
  }),
);

workRouter.delete(
  "/projects/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deleteProject(auth.companyId, req.params.id, auth.employeeId, auth.roles);
    res.status(204).send();
  }),
);

// --------------------------------------------------------------------- teams

workRouter.get(
  "/teams",
  requirePermission("work:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    res.json({ data: await listTeams(auth.companyId) });
  }),
);

workRouter.post(
  "/teams",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, teamWriteSchema);
    const dto = await createTeam(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: dto });
  }),
);

workRouter.put(
  "/teams/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, teamWriteSchema);
    const dto = await updateTeam(auth.companyId, req.params.id, payload, auth.employeeId, auth.roles);
    res.json({ data: dto });
  }),
);

workRouter.delete(
  "/teams/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deleteTeam(auth.companyId, req.params.id, auth.employeeId, auth.roles);
    res.status(204).send();
  }),
);

// -------------------------------------------------------------- the employee

/**
 * "What am I on today, and what am I on next?"
 *
 * No parameters: the server knows who is asking and what day it is where the
 * company is. A phone that guessed the date from its own clock would show the
 * wrong day to anybody whose device is set to another timezone.
 */
workRouter.get(
  "/mine",
  requirePermission("self:tasks"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const today = req.query.date
      ? requireIsoDate(req.query.date, "date")
      : await todayFor(auth.companyId);
    res.json({ data: await myWork(auth.companyId, auth.employeeId, today) });
  }),
);

/**
 * Report progress on your own work. The assignee may move the status; the
 * service refuses anybody else who lacks work:write.
 */
workRouter.post(
  "/tasks/:id/status",
  requirePermission("self:tasks"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, taskStatusSchema);
    const dto = await setTaskStatus(
      auth.companyId,
      req.params.id,
      payload.status,
      payload.note ?? null,
      auth.employeeId,
      auth.roles,
      hasPermission(auth.roles, "work:write"),
    );
    res.json({ data: dto });
  }),
);

// --------------------------------------------------------------- the planner

workRouter.get(
  "/tasks",
  requirePermission("work:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const from = req.query.from
      ? requireIsoDate(req.query.from, "from")
      : await todayFor(auth.companyId);
    const to = req.query.to ? requireIsoDate(req.query.to, "to") : from;
    if (to < from) throw ApiError.validation("to must not be before from");

    res.json({
      data: await listTasks(auth.companyId, from, to, {
        projectId: req.query.projectId ? String(req.query.projectId) : undefined,
        employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
      }),
    });
  }),
);

/** One day, grouped by person — what the portal shows a manager each morning. */
workRouter.get(
  "/board",
  requirePermission("work:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const date = req.query.date
      ? requireIsoDate(req.query.date, "date")
      : await todayFor(auth.companyId);
    res.json({ data: await dayBoard(auth.companyId, date) });
  }),
);

workRouter.post(
  "/tasks",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, taskCreateSchema);
    const dto = await createTask(auth.companyId, payload, auth.employeeId, auth.roles);
    res.status(201).json({ data: dto });
  }),
);

workRouter.patch(
  "/tasks/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, taskUpdateSchema);
    const dto = await updateTask(auth.companyId, req.params.id, payload, auth.employeeId, auth.roles);
    res.json({ data: dto });
  }),
);

workRouter.delete(
  "/tasks/:id",
  requirePermission("work:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deleteTask(auth.companyId, req.params.id, auth.employeeId, auth.roles);
    res.status(204).send();
  }),
);
