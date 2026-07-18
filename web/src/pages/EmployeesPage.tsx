import { useMemo, useState, type FormEvent } from "react";
import { useCreateEmployee, useEmployees } from "../api/hooks";
import { ApiError } from "../api/client";
import type {
  AssignableRole,
  Employee,
  EmployeeCreated,
  EmployeeStatus,
  EmploymentType,
} from "../api/types";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";

const EMPLOYMENT_TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
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
  const [toast, setToast] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const employees = useEmployees({});

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <EmployeeForm
          onClose={() => setShowForm(false)}
          onCreated={(created) => {
            setShowForm(false);
            if (created.tempPassword) {
              setCredentials({ email: created.email, password: created.tempPassword });
            } else {
              setToast(t("emp_created"));
              window.setTimeout(() => setToast(null), 2500);
            }
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
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: EmployeeCreated) => void;
}) {
  const { t } = useI18n();
  const { me } = useAuth();
  const create = useCreateEmployee();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    branchId: me?.branchIds[0] ?? "",
    employmentType: "FULL_TIME" as EmploymentType,
    joinDate: isoToday(),
    status: "ACTIVE" as EmployeeStatus,
    role: "EMPLOYEE" as AssignableRole,
    createLogin: true,
    initialPassword: "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    try {
      const created = await create.mutateAsync({
        employeeCode: form.employeeCode,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        branchId: form.branchId || null,
        employmentType: form.employmentType,
        joinDate: form.joinDate,
        status: form.status,
        role: form.role,
        createLogin: form.createLogin,
        initialPassword: form.initialPassword || undefined,
      });
      onCreated(created);
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
        <h2>{t("emp_add")}</h2>
        <div className="form-grid">
          <Text label={t("emp_code")} value={form.employeeCode} onChange={(v) => set("employeeCode", v)} error={fieldErrors.employeeCode} />
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

        <div className="field">
          <label>{t("emp_role")}</label>
          <select className="select" value={form.role} onChange={(e) => set("role", e.target.value as AssignableRole)}>
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

        {formError && <div className="field-error">{formError}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t("emp_cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" dir={dir} value={value} onChange={(e) => onChange(e.target.value)} />
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
