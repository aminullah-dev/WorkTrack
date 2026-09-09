import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  useCreateEmployee,
  useEmployeeSalary,
  useSetEmployeeSalary,
  useEmployees,
  useResetEmployeeFace,
  useResetEmployeePassword,
  useUpdateEmployee,
} from "../api/hooks";
import { ApiError } from "../api/client";
import type {
  AssignableRole,
  PayModel,
  Employee,
  EmployeeCreated,
  EmployeeStatus,
  EmploymentType,
} from "../api/types";
import { useAuth, useFeatures, useHasPermission } from "../auth/AuthProvider";
import { EmployeeComponents } from "./EmployeeComponents";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip, EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";

const EMPLOYMENT_TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
const STATUSES: EmployeeStatus[] = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "EXITED"];
const ROLES: AssignableRole[] = [
  "EMPLOYEE",
  "TEAM_LEAD",
  "BRANCH_MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "AUDITOR",
];

export function EmployeesPage() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const features = useFeatures();
  const resetFace = useResetEmployeeFace();
  const showFace = features.faceRecognition;

  const employees = useEmployees({});

  async function onResetFace(id: string) {
    try {
      await resetFace.mutateAsync(id);
      setToast(t("emp_face_reset_done"));
    } catch {
      setToast(t("common_error"));
    }
    window.setTimeout(() => setToast(null), 2500);
  }

  const filtered = useMemo(() => {
    const rows = employees.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    );
  }, [employees.data, search]);

  return (
    <>
      <div className="topbar">
        <h1 className="page-title">{t("emp_title")}</h1>
        {can("employees:write") && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + {t("emp_add")}
          </button>
        )}
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <input
          className="input"
          placeholder={t("emp_search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {employees.isLoading ? (
        <LoadingState />
      ) : employees.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void employees.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState message={t("emp_empty")} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("emp_code")}</th>
                <th>{t("emp_name")}</th>
                <th>{t("emp_email")}</th>
                <th>{t("emp_type")}</th>
                <th>{t("emp_join_date")}</th>
                <th>{t("emp_status")}</th>
                {showFace && <th>{t("emp_face")}</th>}
                {can("employees:write") && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e: Employee) => (
                <tr key={e.id}>
                  <td>{num(e.employeeCode)}</td>
                  <td>
                    {e.firstName} {e.lastName}
                  </td>
                  <td dir="ltr">{e.email}</td>
                  <td>{t(`type_${e.employmentType.toLowerCase()}`)}</td>
                  <td>{shamsi(e.joinDate, { withYear: true })}</td>
                  <td>
                    <StatusChip status={e.status} />
                  </td>
                  {showFace && (
                    <td>
                      <div className="row-actions" style={{ alignItems: "center" }}>
                        <Chip tone={e.faceEnrolled ? "positive" : "neutral"}>
                          {e.faceEnrolled ? t("emp_face_enrolled") : t("emp_face_not_enrolled")}
                        </Chip>
                        {e.faceEnrolled && can("employees:write") && (
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={resetFace.isPending}
                            onClick={() => void onResetFace(e.id)}
                          >
                            {t("emp_face_reset")}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  {can("employees:write") && (
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing(e)}>
                        {t("emp_edit")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showForm || editing) && (
        <EmployeeForm
          employee={editing ?? undefined}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(created) => {
            setShowForm(false);
            setEditing(null);
            if (created?.tempPassword) {
              setCredentials({ email: created.email, password: created.tempPassword });
            } else {
              setToast(t(created ? "emp_created" : "emp_updated"));
              window.setTimeout(() => setToast(null), 2500);
            }
          }}
          onPasswordReset={(email, password) => {
            setEditing(null);
            setCredentials({ email, password });
          }}
        />
      )}
      {credentials && (
        <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: { email: string; password: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard
      .writeText(`${credentials.email} / ${credentials.password}`)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2>{t("emp_credentials_title")}</h2>
        <p style={{ color: "var(--slate-50)", fontSize: 14 }}>{t("emp_credentials_hint")}</p>
        <div className="card" style={{ boxShadow: "none", background: "var(--slate-95)" }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "var(--slate-50)" }}>{t("emp_credentials_email")}</div>
            <div dir="ltr" style={{ fontWeight: 600 }}>{credentials.email}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--slate-50)" }}>{t("emp_credentials_password")}</div>
            <div dir="ltr" style={{ fontWeight: 600, fontFamily: "monospace" }}>{credentials.password}</div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={copy}>
            {copied ? t("emp_credentials_copied") : t("emp_credentials_copy")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t("emp_credentials_done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeForm({
  onClose,
  onSaved,
  onPasswordReset,
  employee,
}: {
  onClose: () => void;
  onSaved: (created: EmployeeCreated | null) => void;
  onPasswordReset: (email: string, password: string) => void;
  employee?: Employee;
}) {
  const { t } = useI18n();
  const { me } = useAuth();
  const can = useHasPermission();
  const isEdit = !!employee;
  const create = useCreateEmployee();
  const update = useUpdateEmployee();
  // Compensation belongs to whoever runs payroll, so the field only appears
  // for them — anyone else would get a 403 on save.
  const canSetPay = can("payroll:run");
  const existingSalary = useEmployeeSalary(canSetPay && employee ? employee.id : null);
  const setSalary = useSetEmployeeSalary();
  const resetPassword = useResetEmployeePassword();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onResetPassword() {
    if (!employee) return;
    setFormError(null);
    setFieldErrors({});
    try {
      const { tempPassword } = await resetPassword.mutateAsync({
        id: employee.id,
        password: form.initialPassword || undefined,
      });
      onPasswordReset(employee.email, tempPassword);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.password) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError(t("common_error"));
      }
    }
  }
  const [form, setForm] = useState({
    employeeCode: employee?.employeeCode ?? "",
    firstName: employee?.firstName ?? "",
    lastName: employee?.lastName ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    branchId: employee?.branchId ?? me?.branchIds[0] ?? "",
    employmentType: employee?.employmentType ?? ("FULL_TIME" as EmploymentType),
    joinDate: employee?.joinDate ?? isoToday(),
    status: employee?.status ?? ("ACTIVE" as EmployeeStatus),
    // On an edit this starts as whatever the employee already is, and "" when
    // that is unknown — an employee created before roles were shown. Sending
    // "" omits the field, which the server reads as "leave the role alone",
    // so an ordinary edit can never demote somebody by accident.
    role: (isEdit ? ((employee?.role as AssignableRole | undefined) ?? "") : "EMPLOYEE") as
      | AssignableRole
      | "",
    createLogin: !isEdit,
    initialPassword: "",
    basicAmount: "",
    payModel: "MONTHLY" as PayModel,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // The salary lives in its own document, so it arrives after the form mounts.
  // Only seed the field while it is untouched, or typing would be overwritten.
  useEffect(() => {
    const amount = existingSalary.data?.basicAmount;
    if (amount !== undefined) {
      setForm((f) =>
        f.basicAmount === ""
          ? {
              ...f,
              basicAmount: String(amount),
              payModel: existingSalary.data?.payModel ?? "MONTHLY",
            }
          : f,
      );
    }
  }, [existingSalary.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const body = {
      // Left out when blank, which is what asks the server to number this
      // person. Sending "" would just fail validation, and on an edit it is
      // the difference between "leave the code alone" and "erase it".
      employeeCode: form.employeeCode.trim() || undefined,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || null,
      branchId: form.branchId || null,
      employmentType: form.employmentType,
      joinDate: form.joinDate,
      status: form.status,
      role: form.role || undefined,
      createLogin: form.createLogin,
      initialPassword: form.initialPassword || undefined,
    };
    try {
      // The employee record is saved first: the salary hangs off its id, and a
      // new employee has none until the create returns.
      const savedId = isEdit && employee ? employee.id : null;
      let created: EmployeeCreated | null = null;
      if (savedId) {
        await update.mutateAsync({ id: savedId, body });
      } else {
        created = await create.mutateAsync(body);
      }

      const targetId = savedId ?? created?.id;
      const amount = form.basicAmount.trim();
      if (canSetPay && targetId && amount !== "") {
        const basicAmount = Number(amount);
        if (Number.isFinite(basicAmount) && basicAmount >= 0) {
          await setSalary.mutateAsync({
            id: targetId,
            body: { basicAmount, payModel: form.payModel, effectiveFrom: form.joinDate },
          });
        }
      }
      onSaved(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        // Duplicate-email and other business errors carry no field map.
        if (!Object.keys(err.fieldErrors).length) {
          setFormError(err.code === "CONFLICT" ? t("signup_email_exists") : err.message);
        }
      } else {
        setFormError(t("common_error"));
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <h2>{isEdit ? t("emp_edit_title") : t("emp_add")}</h2>
        <div className="form-grid">
          {/* Blank on a new hire: the server assigns the next code, and the
              placeholder says so rather than leaving an empty box that looks
              like something the user forgot. Still typeable — a company with
              its own payroll numbers keeps using them. */}
          <Text
            label={t("emp_code")}
            value={form.employeeCode}
            onChange={(v) => set("employeeCode", v)}
            error={fieldErrors.employeeCode}
            placeholder={isEdit ? undefined : t("emp_code_auto")}
            dir="ltr"
          />
          <Text label={t("emp_phone")} value={form.phone} onChange={(v) => set("phone", v)} dir="ltr" />
          <Text label={t("emp_name")} value={form.firstName} onChange={(v) => set("firstName", v)} error={fieldErrors.firstName} />
          <Text label={`${t("emp_name")} (2)`} value={form.lastName} onChange={(v) => set("lastName", v)} error={fieldErrors.lastName} />
        </div>
        <Text label={t("emp_email")} value={form.email} onChange={(v) => set("email", v)} dir="ltr" error={fieldErrors.email} />
        <div className="form-grid">
          <div className="field">
            <label>{t("emp_type")}</label>
            <select className="select" value={form.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>
              {EMPLOYMENT_TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {t(`type_${tp.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("emp_join_date")}</label>
            <input className="input" type="date" dir="ltr" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} />
          </div>
        </div>

        {canSetPay && (
          <div className="field">
            {/* Chosen BEFORE the amount, because it decides what the amount
                means: 30,000 is a monthly salary or an absurd daily wage, and
                the label below changes to say which. */}
            <label>{t("emp_pay_model")}</label>
            <select
              className="select"
              value={form.payModel}
              onChange={(e) => set("payModel", e.target.value as PayModel)}
            >
              {(["MONTHLY", "DAILY", "PIECE"] as PayModel[]).map((m) => (
                <option key={m} value={m}>
                  {t(`pay_model_${m.toLowerCase()}`)}
                </option>
              ))}
            </select>
            <small style={{ color: "var(--text-subtle)" }}>
              {t(`pay_model_hint_${form.payModel.toLowerCase()}`)}
            </small>
          </div>
        )}

        {canSetPay && (
          <div className="field">
            <label>
              {t(
                form.payModel === "DAILY"
                  ? "emp_rate_daily"
                  : form.payModel === "PIECE"
                    ? "emp_rate_piece"
                    : "emp_basic_salary",
                me?.currency ?? "AFN",
              )}
            </label>
            <input
              className="input"
              type="number"
              min="0"
              step="100"
              dir="ltr"
              value={form.basicAmount}
              onChange={(e) => set("basicAmount", e.target.value)}
              placeholder={t("emp_basic_salary_ph")}
            />
            <small style={{ color: "var(--text-subtle)" }}>{t("emp_basic_salary_hint")}</small>
          </div>
        )}

        {/* Allowances and deductions for this person. Only for an employee who
            already exists — an assignment needs an id to point at. */}
        {canSetPay && isEdit && <EmployeeComponents employeeId={employee?.id ?? null} />}

        {isEdit ? (
          <>
            <div className="field">
              <label>{t("emp_role")}</label>
              <select
                className="select"
                value={form.role}
                onChange={(e) => set("role", e.target.value as AssignableRole | "")}
              >
                {/* Present when the role is unknown, and selectable on purpose:
                    choosing it leaves the role exactly as it is. */}
                <option value="">{t("emp_role_unchanged")}</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r.toLowerCase()}`)}
                  </option>
                ))}
              </select>
              {fieldErrors.role && <span className="field-error">{fieldErrors.role}</span>}
            </div>
            <div className="field">
              <label>{t("emp_status")}</label>
              <select
                className="select"
                value={form.status}
                onChange={(e) => set("status", e.target.value as EmployeeStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status_${s.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("emp_login")}</label>
              <input
                className="input"
                type="text"
                dir="ltr"
                placeholder={t("emp_set_password_ph")}
                value={form.initialPassword}
                onChange={(e) => set("initialPassword", e.target.value)}
              />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: 8, alignSelf: "flex-start" }}
                onClick={() => void onResetPassword()}
                disabled={resetPassword.isPending}
              >
                {t("emp_set_password")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>{t("emp_role")}</label>
              <select
                className="select"
                value={form.role}
                onChange={(e) => set("role", e.target.value as AssignableRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r.toLowerCase()}`)}
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.createLogin}
                onChange={(e) => set("createLogin", e.target.checked)}
              />
              {t("emp_create_login")}
            </label>

            {form.createLogin && (
              <Text
                label={t("emp_password_optional")}
                value={form.initialPassword}
                onChange={(v) => set("initialPassword", v)}
                dir="ltr"
                error={fieldErrors.initialPassword}
              />
            )}
          </>
        )}

        {formError && <div className="field-error">{formError}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t("emp_cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={create.isPending || update.isPending}
          >
            {t("emp_save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  error,
  dir,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  dir?: "ltr" | "rtl";
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        dir={dir}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
