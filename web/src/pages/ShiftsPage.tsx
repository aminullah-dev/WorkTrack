import { useMemo, useState } from "react";
import {
  useAssignRoster,
  useEmployees,
  useRoster,
  useSaveShift,
  useShifts,
} from "../api/hooks";
import { useHasPermission } from "../auth/AuthProvider";
import type { Shift, ShiftWrite } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, Switch, Toast } from "../ui/components";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function durationHours(start: string, end: string): number {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  let d = m(end) - m(start);
  if (d <= 0) d += 1440;
  return Math.round((d / 60) * 10) / 10;
}

const EMPTY_SHIFT: ShiftWrite = {
  name: "",
  code: "",
  startTime: "08:00",
  endTime: "16:00",
  breakMinutes: 60,
  graceInMinutes: 10,
  graceOutMinutes: 10,
  active: true,
};

export function ShiftsPage() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const canWrite = can("rosters:write");
  const shifts = useShifts();
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("shift_title")}</h1>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            {t("shift_add")}
          </button>
        )}
      </div>

      {/* Shift definitions */}
      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <h2 style={{ margin: 0, padding: "16px 20px", fontSize: 16 }}>{t("shift_defs")}</h2>
        {shifts.isLoading ? (
          <LoadingState />
        ) : shifts.isError ? (
          <ErrorState message={t("common_error")} onRetry={() => void shifts.refetch()} />
        ) : (shifts.data?.length ?? 0) === 0 ? (
          <EmptyState message={t("shift_empty")} />
        ) : (
          <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("shift_name")}</th>
                  <th>{t("shift_code")}</th>
                  <th>{t("shift_time")}</th>
                  <th>{t("shift_break")}</th>
                  <th>{t("emp_status")}</th>
                  {canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {shifts.data!.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}{" "}
                      <ShiftBadge start={s.startTime} end={s.endTime} />
                    </td>
                    <td dir="ltr">{s.code}</td>
                    <td dir="ltr">
                      {num(s.startTime)} – {num(s.endTime)}
                    </td>
                    <td>{num(s.breakMinutes)}</td>
                    <td>
                      <Chip tone={s.active ? "positive" : "neutral"}>
                        {s.active ? t("shift_active") : t("shift_inactive")}
                      </Chip>
                    </td>
                    {canWrite && (
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>
                          {t("shift_edit")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily roster */}
      <RosterCard canWrite={canWrite} onAssign={() => setAssigning(true)} />

      {editing && (
        <ShiftDialog
          initial={editing === "new" ? EMPTY_SHIFT : editing}
          shiftId={editing === "new" ? undefined : editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            flash(t("shift_saved"));
          }}
        />
      )}
      {assigning && (
        <AssignDialog
          onClose={() => setAssigning(false)}
          onSaved={(count) => {
            setAssigning(false);
            flash(t("roster_assigned", num(count)));
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function ShiftBadge({ start, end }: { start: string; end: string }) {
  const { t, num } = useI18n();
  if (start === end) return <Chip tone="warning">{t("shift_24h")}</Chip>;
  if (end <= start) return <Chip tone="neutral">{t("shift_night")}</Chip>;
  return <Chip tone="positive">{t("shift_hours", num(durationHours(start, end)))}</Chip>;
}

function RosterCard({ canWrite, onAssign }: { canWrite: boolean; onAssign: () => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(isoToday());
  const roster = useRoster(date);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 20px",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>{t("roster_title")}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="input"
            type="date"
            dir="ltr"
            style={{ width: "auto" }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {canWrite && (
            <button className="btn btn-primary btn-sm" onClick={onAssign}>
              {t("roster_assign")}
            </button>
          )}
        </div>
      </div>
      {roster.isLoading ? (
        <LoadingState />
      ) : roster.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void roster.refetch()} />
      ) : (roster.data?.length ?? 0) === 0 ? (
        <EmptyState message={t("roster_empty")} />
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("roster_employee")}</th>
                <th>{t("roster_shift_col")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.data!.map((r) => (
                <tr key={r.id}>
                  <td>{r.employeeName}</td>
                  <td>{r.shiftName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShiftDialog({
  initial,
  shiftId,
  onClose,
  onSaved,
}: {
  initial: ShiftWrite;
  shiftId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveShift();
  const [form, setForm] = useState<ShiftWrite>({
    name: initial.name,
    code: initial.code,
    startTime: initial.startTime,
    endTime: initial.endTime,
    breakMinutes: initial.breakMinutes,
    graceInMinutes: initial.graceInMinutes,
    graceOutMinutes: initial.graceOutMinutes,
    active: initial.active,
  });
  const set = <K extends keyof ShiftWrite>(k: K, v: ShiftWrite[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.name.trim() || !form.code.trim()) return;
    try {
      await save.mutateAsync({ id: shiftId, body: form });
      onSaved();
    } catch {
      /* surfaced by the parent toast on next attempt */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{shiftId ? t("shift_edit") : t("shift_add")}</h2>
        <div className="form-grid">
          <Field label={t("shift_name")} value={form.name} onChange={(v) => set("name", v)} />
          <Field label={t("shift_code")} value={form.code} onChange={(v) => set("code", v)} ltr />
          <TimeField label={t("shift_start")} value={form.startTime} onChange={(v) => set("startTime", v)} />
          <TimeField label={t("shift_end")} value={form.endTime} onChange={(v) => set("endTime", v)} />
          <NumField label={t("shift_break")} value={form.breakMinutes} onChange={(v) => set("breakMinutes", v)} />
          <NumField label={t("shift_grace_in")} value={form.graceInMinutes} onChange={(v) => set("graceInMinutes", v)} />
          <NumField label={t("shift_grace_out")} value={form.graceOutMinutes} onChange={(v) => set("graceOutMinutes", v)} />
        </div>
        <div className="switch-row">
          <div className="txt">
            <b>{t("shift_active")}</b>
          </div>
          <Switch checked={form.active} onChange={(v) => set("active", v)} label={t("shift_active")} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            {t("emp_cancel")}
          </button>
          <button className="btn btn-primary" disabled={save.isPending} onClick={() => void submit()}>
            {t("emp_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const { t } = useI18n();
  const shifts = useShifts();
  const emps = useEmployees({});
  const assign = useAssignRoster();
  const [shiftId, setShiftId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState("");

  const employees = useMemo(() => emps.data?.data ?? [], [emps.data]);
  const activeShifts = (shifts.data ?? []).filter((s) => s.active);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  async function submit() {
    if (!shiftId || picked.size === 0) return;
    try {
      const res = await assign.mutateAsync({
        employeeIds: [...picked],
        shiftId,
        from,
        to: to || undefined,
      });
      onSaved(res.created);
    } catch {
      /* parent toast */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("roster_assign")}</h2>

        <div className="field">
          <label>{t("roster_pick_shift")}</label>
          <select className="select" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">—</option>
            {activeShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime})
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t("roster_from")}</label>
            <input className="input" type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("roster_to")}</label>
            <input className="input" type="date" dir="ltr" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>{t("roster_pick_emps")}</label>
          <div className="chip-set">
            {employees.map((e) => (
              <button
                type="button"
                key={e.id}
                className={`chip-toggle${picked.has(e.id) ? " on" : ""}`}
                onClick={() => toggle(e.id)}
              >
                {e.firstName} {e.lastName}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            {t("emp_cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={assign.isPending || !shiftId || picked.size === 0}
            onClick={() => void submit()}
          >
            {t("roster_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- small field helpers ---- */
function Field({
  label,
  value,
  onChange,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ltr?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        dir={ltr ? "ltr" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="time" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type="number"
        dir="ltr"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
