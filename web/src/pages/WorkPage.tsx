import { useMemo, useState } from "react";
import {
  useDayBoard,
  useDeleteProject,
  useDeleteTask,
  useDeleteWorkTeam,
  useEmployees,
  useMyWork,
  useProjects,
  useSaveProject,
  useSaveTask,
  useSaveWorkTeam,
  useSetTaskStatus,
  useWorkTasks,
  useWorkTeams,
} from "../api/hooks";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import type {
  Project,
  ProjectWrite,
  TaskStatus,
  TaskWrite,
  WorkTask,
  WorkTeam,
  WorkTeamWrite,
} from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Switch, Toast } from "../ui/components";
import { isoTodayIn } from "../time";

/**
 * Who is on which part of the work, and when.
 *
 * The first tab is the question a manager is actually asked every morning —
 * "who is on what today" — so it is what opens. The last tab is the same
 * question about themselves, because a branch manager is somebody's employee
 * too and the phone is not the only place that answer belongs.
 */

type Tab = "board" | "plan" | "projects" | "teams" | "mine";

const STATUS_TONE: Record<TaskStatus, "positive" | "warning" | "neutral" | "negative"> = {
  PLANNED: "neutral",
  IN_PROGRESS: "warning",
  DONE: "positive",
  BLOCKED: "negative",
};

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function WorkPage() {
  const { t } = useI18n();
  const can = useHasPermission();
  const canPlan = can("work:write");
  const canRead = can("work:read");
  const [tab, setTab] = useState<Tab>(canRead ? "board" : "mine");
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "board", label: t("work_tab_board"), show: canRead },
    { key: "plan", label: t("work_tab_plan"), show: canRead },
    { key: "projects", label: t("work_tab_projects"), show: canRead },
    { key: "teams", label: t("work_tab_teams"), show: canRead },
    { key: "mine", label: t("work_tab_mine"), show: can("self:tasks") },
  ];

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("work_title")}</h1>
      </div>
      <p className="hint" style={{ marginTop: -8, marginBottom: 16 }}>
        {t("work_intro")}
      </p>

      <div className="tabs" role="tablist">
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={tab === x.key}
              className={`tab${tab === x.key ? " active" : ""}`}
              onClick={() => setTab(x.key)}
            >
              {x.label}
            </button>
          ))}
      </div>

      {tab === "board" && <DayBoardCard canPlan={canPlan} onFlash={flash} />}
      {tab === "plan" && <PlanCard canPlan={canPlan} onFlash={flash} />}
      {tab === "projects" && <ProjectsCard canPlan={canPlan} onFlash={flash} />}
      {tab === "teams" && <TeamsCard canPlan={canPlan} onFlash={flash} />}
      {tab === "mine" && <MyWorkCard onFlash={flash} />}

      {toast && <Toast message={toast} />}
    </>
  );
}

// ------------------------------------------------------------------- board

function DayBoardCard({ canPlan, onFlash }: { canPlan: boolean; onFlash: (m: string) => void }) {
  const { t, num, shamsi } = useI18n();
  const [date, setDate] = useState(() => isoTodayIn("Asia/Kabul"));
  const [assigning, setAssigning] = useState(false);
  const board = useDayBoard(date);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: "16px 20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("work_board_title")}</h2>
          <p className="hint" style={{ marginTop: 2 }}>
            {shamsi(date, { withYear: true })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, -1))}>
            {t("work_prev_day")}
          </button>
          <input
            className="input"
            type="date"
            dir="ltr"
            style={{ width: 160 }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label={t("work_date")}
          />
          <button className="btn btn-outline btn-sm" onClick={() => setDate(addDays(date, 1))}>
            {t("work_next_day")}
          </button>
          {canPlan && (
            <button className="btn btn-primary btn-sm" onClick={() => setAssigning(true)}>
              {t("work_assign")}
            </button>
          )}
        </div>
      </div>

      {board.isLoading ? (
        <LoadingState />
      ) : board.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void board.refetch()} />
      ) : (board.data?.rows.length ?? 0) === 0 ? (
        <EmptyState message={t("work_board_empty")} />
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("work_person")}</th>
                <th>{t("work_task")}</th>
              </tr>
            </thead>
            <tbody>
              {board.data!.rows.map((row) => (
                <tr key={row.employeeId}>
                  <td>
                    {row.name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {num(row.tasks.length)} {t("work_items")}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: 6 }}>
                      {row.tasks.map((task) => (
                        <TaskLine key={task.id} task={task} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigning && (
        <TaskDialog
          initialDate={date}
          onClose={() => setAssigning(false)}
          onSaved={() => {
            setAssigning(false);
            onFlash(t("work_saved"));
          }}
        />
      )}
    </div>
  );
}

function TaskLine({ task }: { task: WorkTask }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Chip tone={STATUS_TONE[task.status]}>{t(`work_status_${task.status.toLowerCase()}`)}</Chip>
      <b>{task.title}</b>
      <span className="muted" style={{ fontSize: 12 }}>
        {task.projectName}
        {task.teamName ? ` — ${task.teamName}` : ""}
        {task.location ? ` — ${task.location}` : ""}
      </span>
    </div>
  );
}

// -------------------------------------------------------------------- plan

/** The week ahead, as a planner reads it: one row per task, sorted by day. */
function PlanCard({ canPlan, onFlash }: { canPlan: boolean; onFlash: (m: string) => void }) {
  const { t, num, shamsi } = useI18n();
  const [from, setFrom] = useState(() => isoTodayIn("Asia/Kabul"));
  const [days, setDays] = useState(7);
  const [projectId, setProjectId] = useState("");
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const to = addDays(from, days - 1);

  const projects = useProjects();
  const tasks = useWorkTasks(from, to, { projectId: projectId || undefined });
  const remove = useDeleteTask();

  async function onDelete(task: WorkTask) {
    if (!window.confirm(t("work_delete_confirm", task.title))) return;
    await remove.mutateAsync(task.id);
    onFlash(t("work_deleted"));
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: "16px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("work_plan_title")}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            type="date"
            dir="ltr"
            style={{ width: 160 }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t("work_from")}
          />
          <select
            className="input"
            style={{ width: 120 }}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label={t("work_span")}
          >
            <option value={1}>{t("work_span_day")}</option>
            <option value={7}>{t("work_span_week")}</option>
            <option value={30}>{t("work_span_month")}</option>
          </select>
          <select
            className="input"
            style={{ width: 180 }}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label={t("work_project")}
          >
            <option value="">{t("work_all_projects")}</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tasks.isLoading ? (
        <LoadingState />
      ) : tasks.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void tasks.refetch()} />
      ) : (tasks.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("work_plan_empty")} />
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("work_when")}</th>
                <th>{t("work_task")}</th>
                <th>{t("work_who")}</th>
                <th>{t("work_status")}</th>
                {canPlan && <th />}
              </tr>
            </thead>
            <tbody>
              {tasks.data!.map((task) => (
                <tr key={task.id}>
                  <td>
                    {shamsi(task.startDate)}
                    {task.endDate !== task.startDate && ` – ${shamsi(task.endDate)}`}
                    <div className="muted" dir="ltr" style={{ fontSize: 12 }}>
                      {num(task.startDate)}
                    </div>
                  </td>
                  <td>
                    <b>{task.title}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {task.projectName}
                      {task.location ? ` — ${task.location}` : ""}
                    </div>
                  </td>
                  <td>
                    {task.teamName && (
                      <div>
                        <Chip tone="neutral">{task.teamName}</Chip>
                      </div>
                    )}
                    <span style={{ fontSize: 13 }}>{task.assigneeNames.join("، ")}</span>
                  </td>
                  <td>
                    <Chip tone={STATUS_TONE[task.status]}>
                      {t(`work_status_${task.status.toLowerCase()}`)}
                    </Chip>
                  </td>
                  {canPlan && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(task)}>
                        {t("work_edit")}
                      </button>{" "}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => void onDelete(task)}
                      >
                        {t("work_delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskDialog
          task={editing}
          initialDate={editing.startDate}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onFlash(t("work_saved"));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- projects

function ProjectsCard({ canPlan, onFlash }: { canPlan: boolean; onFlash: (m: string) => void }) {
  const { t } = useI18n();
  const projects = useProjects();
  const remove = useDeleteProject();
  const [editing, setEditing] = useState<Project | "new" | null>(null);

  async function onDelete(p: Project) {
    if (!window.confirm(t("work_delete_confirm", p.name))) return;
    try {
      await remove.mutateAsync(p.id);
      onFlash(t("work_deleted"));
    } catch (e) {
      // The server refuses while work is still assigned to it; say so rather
      // than leaving the row sitting there unexplained.
      onFlash(e instanceof Error ? e.message : t("common_error"));
    }
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: "16px 20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("work_projects_title")}</h2>
          <p className="hint" style={{ marginTop: 2 }}>{t("work_projects_hint")}</p>
        </div>
        {canPlan && (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            {t("work_project_add")}
          </button>
        )}
      </div>

      {projects.isLoading ? (
        <LoadingState />
      ) : (projects.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("work_projects_empty")} />
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("work_project")}</th>
                <th>{t("work_code")}</th>
                <th>{t("work_status")}</th>
                {canPlan && <th />}
              </tr>
            </thead>
            <tbody>
              {projects.data!.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    {p.description && (
                      <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>
                    )}
                  </td>
                  <td dir="ltr">{p.code}</td>
                  <td>
                    <Chip tone={p.status === "ACTIVE" ? "positive" : "neutral"}>
                      {t(`work_pstatus_${p.status.toLowerCase()}`)}
                    </Chip>
                  </td>
                  {canPlan && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(p)}>
                        {t("work_edit")}
                      </button>{" "}
                      <button className="btn btn-outline btn-sm" onClick={() => void onDelete(p)}>
                        {t("work_delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProjectDialog
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onFlash(t("work_saved"));
          }}
        />
      )}
    </div>
  );
}

const EMPTY_PROJECT: ProjectWrite = {
  name: "",
  code: "",
  description: null,
  branchId: null,
  managerId: null,
  status: "ACTIVE",
  startDate: null,
  endDate: null,
};

function ProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project: Project | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveProject();
  const [form, setForm] = useState<ProjectWrite>(
    project
      ? {
          name: project.name,
          code: project.code,
          description: project.description,
          branchId: project.branchId,
          managerId: project.managerId,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
        }
      : EMPTY_PROJECT,
  );
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProjectWrite>(k: K, v: ProjectWrite[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim() || !form.code.trim()) return;
    try {
      await save.mutateAsync({ id: project?.id, body: form });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{project ? t("work_project_edit") : t("work_project_add")}</h2>
        <div className="field">
          <label className="label" htmlFor="pr-name">{t("work_project_name")}</label>
          <input
            id="pr-name"
            className="input"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="pr-code">{t("work_code")}</label>
          <input
            id="pr-code"
            className="input"
            dir="ltr"
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="pr-desc">{t("work_detail")}</label>
          <textarea
            id="pr-desc"
            className="input"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value || null)}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="pr-status">{t("work_status")}</label>
          <select
            id="pr-status"
            className="input"
            value={form.status}
            onChange={(e) => set("status", e.target.value as ProjectWrite["status"])}
          >
            {(["PLANNED", "ACTIVE", "PAUSED", "DONE"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`work_pstatus_${s.toLowerCase()}`)}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            {t("common_cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={save.isPending || !form.name.trim() || !form.code.trim()}
            onClick={() => void submit()}
          >
            {t("common_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- teams

function TeamsCard({ canPlan, onFlash }: { canPlan: boolean; onFlash: (m: string) => void }) {
  const { t, num } = useI18n();
  const teams = useWorkTeams();
  const remove = useDeleteWorkTeam();
  const [editing, setEditing] = useState<WorkTeam | "new" | null>(null);

  async function onDelete(team: WorkTeam) {
    if (!window.confirm(t("work_team_delete_confirm", team.name))) return;
    await remove.mutateAsync(team.id);
    onFlash(t("work_deleted"));
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: "16px 20px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t("work_teams_title")}</h2>
          <p className="hint" style={{ marginTop: 2 }}>{t("work_teams_hint")}</p>
        </div>
        {canPlan && (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            {t("work_team_add")}
          </button>
        )}
      </div>

      {teams.isLoading ? (
        <LoadingState />
      ) : (teams.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("work_teams_empty")} />
      ) : (
        <ul className="empc-list">
          {teams.data!.map((team) => (
            <li key={team.id} className="empc-row">
              <div className="empc-name">
                <div>
                  <b>{team.name}</b>{" "}
                  {!team.active && <Chip tone="neutral">{t("work_team_inactive")}</Chip>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {num(team.memberIds.length)} {t("work_members")}
                </div>
              </div>
              {canPlan && (
                <div style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing(team)}>
                    {t("work_edit")}
                  </button>{" "}
                  <button className="btn btn-outline btn-sm" onClick={() => void onDelete(team)}>
                    {t("work_delete")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TeamDialog
          team={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onFlash(t("work_saved"));
          }}
        />
      )}
    </div>
  );
}

function TeamDialog({
  team,
  onClose,
  onSaved,
}: {
  team: WorkTeam | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveWorkTeam();
  const emps = useEmployees({});
  const employees = useMemo(() => emps.data?.data ?? [], [emps.data]);

  const [form, setForm] = useState<WorkTeamWrite>(
    team
      ? {
          name: team.name,
          projectId: team.projectId,
          leadId: team.leadId,
          memberIds: team.memberIds,
          active: team.active,
        }
      : { name: "", projectId: null, leadId: null, memberIds: [], active: true },
  );
  const picked = new Set(form.memberIds);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setForm((f) => ({ ...f, memberIds: [...next] }));
  };

  async function submit() {
    if (!form.name.trim()) return;
    await save.mutateAsync({ id: team?.id, body: form });
    onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{team ? t("work_team_edit") : t("work_team_add")}</h2>
        <div className="field">
          <label className="label" htmlFor="tm-name">{t("work_team_name")}</label>
          <input
            id="tm-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">{t("work_members")}</span>
          <div className="picker-list">
            {employees.map((e) => (
              <label key={e.id} className="picker-row">
                <input
                  type="checkbox"
                  checked={picked.has(e.id)}
                  onChange={() => toggle(e.id)}
                />
                <span>
                  {e.firstName} {e.lastName}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="switch-row" style={{ marginTop: 12 }}>
          <div className="txt">
            <b>{t("work_team_active")}</b>
          </div>
          <Switch
            checked={form.active}
            onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            label={t("work_team_active")}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            {t("common_cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={save.isPending || !form.name.trim()}
            onClick={() => void submit()}
          >
            {t("common_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- task

/**
 * Assigning work.
 *
 * A crew and named people are both offered at once because that is how a site
 * actually assigns: the concrete crew, plus the electrician who joins them for
 * the morning. The server merges the two.
 */
function TaskDialog({
  task,
  initialDate,
  onClose,
  onSaved,
}: {
  task?: WorkTask;
  initialDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveTask();
  const projects = useProjects();
  const teams = useWorkTeams();
  const emps = useEmployees({});
  const employees = useMemo(() => emps.data?.data ?? [], [emps.data]);

  const [form, setForm] = useState<TaskWrite>(
    task
      ? {
          projectId: task.projectId,
          title: task.title,
          detail: task.detail,
          location: task.location,
          startDate: task.startDate,
          endDate: task.endDate,
          priority: task.priority,
          teamId: task.teamId,
          assigneeIds: [],
        }
      : {
          projectId: "",
          title: "",
          detail: null,
          location: null,
          startDate: initialDate,
          endDate: null,
          priority: "NORMAL",
          teamId: null,
          assigneeIds: [],
        },
  );
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TaskWrite>(k: K, v: TaskWrite[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const picked = new Set(form.assigneeIds);
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set("assigneeIds", [...next]);
  };

  const activeProjects = (projects.data ?? []).filter(
    (p) => p.status !== "DONE" || p.id === form.projectId,
  );
  const activeTeams = (teams.data ?? []).filter((x) => x.active || x.id === form.teamId);

  // Editing an existing task and touching neither crew nor people must not
  // re-assign it — so those fields are only sent when they were used.
  const reassigned = form.teamId !== (task?.teamId ?? null) || form.assigneeIds.length > 0;

  async function submit() {
    if (!form.projectId || !form.title.trim()) return;
    setError(null);
    const body: Partial<TaskWrite> = {
      projectId: form.projectId,
      title: form.title.trim(),
      detail: form.detail || null,
      location: form.location || null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      priority: form.priority,
    };
    if (!task || reassigned) {
      body.teamId = form.teamId;
      body.assigneeIds = form.assigneeIds;
    }
    try {
      await save.mutateAsync({ id: task?.id, body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{task ? t("work_edit") : t("work_assign")}</h2>

        <div className="field">
          <label className="label" htmlFor="tk-project">{t("work_project")}</label>
          <select
            id="tk-project"
            className="input"
            value={form.projectId}
            onChange={(e) => set("projectId", e.target.value)}
          >
            <option value="">{t("work_choose_project")}</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="tk-title">{t("work_task")}</label>
          <input
            id="tk-title"
            className="input"
            placeholder={t("work_task_ph")}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="tk-detail">{t("work_detail")}</label>
          <textarea
            id="tk-detail"
            className="input"
            rows={2}
            value={form.detail ?? ""}
            onChange={(e) => set("detail", e.target.value || null)}
          />
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="tk-loc">{t("work_location")}</label>
          <input
            id="tk-loc"
            className="input"
            placeholder={t("work_location_ph")}
            value={form.location ?? ""}
            onChange={(e) => set("location", e.target.value || null)}
          />
        </div>

        <div className="form-grid" style={{ marginTop: 10 }}>
          <div className="field">
            <label className="label" htmlFor="tk-from">{t("work_from")}</label>
            <input
              id="tk-from"
              className="input"
              type="date"
              dir="ltr"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="tk-to">{t("work_to_optional")}</label>
            <input
              id="tk-to"
              className="input"
              type="date"
              dir="ltr"
              value={form.endDate ?? ""}
              onChange={(e) => set("endDate", e.target.value || null)}
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="tk-team">{t("work_team")}</label>
          <select
            id="tk-team"
            className="input"
            value={form.teamId ?? ""}
            onChange={(e) => set("teamId", e.target.value || null)}
          >
            <option value="">{t("work_no_team")}</option>
            {activeTeams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <span className="label">{t("work_also_people")}</span>
          <div className="picker-list">
            {employees.map((e) => (
              <label key={e.id} className="picker-row">
                <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
                <span>
                  {e.firstName} {e.lastName}
                </span>
              </label>
            ))}
          </div>
          {task && !reassigned && <p className="hint">{t("work_keep_assignees")}</p>}
        </div>

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            {t("common_cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={save.isPending || !form.projectId || !form.title.trim()}
            onClick={() => void submit()}
          >
            {t("common_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- my work

/**
 * The signed-in person's own assignments — the portal half of what the phone
 * shows. A manager who assigns work is also assigned work, and asking them to
 * pick up a phone to find out what theirs is would be absurd.
 */
function MyWorkCard({ onFlash }: { onFlash: (m: string) => void }) {
  const { t } = useI18n();
  const { me } = useAuth();
  const mine = useMyWork();

  if (mine.isLoading) return <LoadingState />;
  if (mine.isError) {
    return <ErrorState message={t("common_error")} onRetry={() => void mine.refetch()} />;
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{t("work_mine_title", me?.displayName ?? "")}</h2>
      <p className="hint" style={{ marginTop: 0 }}>{t("work_mine_hint")}</p>

      <MyDay label={t("work_today")} day={mine.data!.today} onFlash={onFlash} />
      {mine.data!.next && (
        <MyDay label={t("work_next")} day={mine.data!.next} onFlash={onFlash} />
      )}
    </div>
  );
}

function MyDay({
  label,
  day,
  onFlash,
}: {
  label: string;
  day: { date: string; kind: string; tasks: WorkTask[] };
  onFlash: (m: string) => void;
}) {
  const { t, num, shamsi } = useI18n();
  const setStatus = useSetTaskStatus();

  async function move(task: WorkTask, status: TaskStatus) {
    await setStatus.mutateAsync({ id: task.id, status });
    onFlash(t("work_saved"));
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="label">{label}</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {shamsi(day.date, { withYear: true })} · <span dir="ltr">{num(day.date)}</span>
        </span>
      </div>

      {day.tasks.length === 0 ? (
        <p className="hint" style={{ marginTop: 6 }}>
          {day.kind === "WORKING" ? t("work_day_free") : t(`work_day_${day.kind.toLowerCase()}`)}
        </p>
      ) : (
        <ul className="empc-list" style={{ marginTop: 8 }}>
          {day.tasks.map((task) => (
            <li key={task.id} className="empc-row">
              <div className="empc-name">
                <div>
                  <b>{task.title}</b>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {task.projectName}
                  {task.location ? ` — ${task.location}` : ""}
                  {task.teamName ? ` — ${task.teamName}` : ""}
                </div>
                {task.detail && <div style={{ fontSize: 13, marginTop: 2 }}>{task.detail}</div>}
                {task.assigneeNames.length > 1 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {t("work_with")}: {task.assigneeNames.join("، ")}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Chip tone={STATUS_TONE[task.status]}>
                  {t(`work_status_${task.status.toLowerCase()}`)}
                </Chip>
                {task.status !== "IN_PROGRESS" && task.status !== "DONE" && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => void move(task, "IN_PROGRESS")}
                  >
                    {t("work_start")}
                  </button>
                )}
                {task.status !== "DONE" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void move(task, "DONE")}
                  >
                    {t("work_finish")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
