import { useMemo, useState, type FormEvent } from "react";
import { useCreateEmployee, useEmployees } from "../api/hooks";
import { ApiError } from "../api/client";
import type { Employee, EmployeeStatus, EmploymentType } from "../api/types";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, StatusChip, Toast } from "../ui/components";

const EMPLOYMENT_TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];

export function EmployeesPage() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
          onCreated={() => {
            setShowForm(false);
            setToast(t("emp_created"));
            window.setTimeout(() => setToast(null), 2500);
          }}
        />
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function EmployeeForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { me } = useAuth();
  const create = useCreateEmployee();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    try {
      await create.mutateAsync({
        employeeCode: form.employeeCode,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || null,
        branchId: form.branchId || null,
        employmentType: form.employmentType,
        joinDate: form.joinDate,
        status: form.status,
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
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

        {create.isError && !Object.keys(fieldErrors).length && (
          <div className="field-error">{t("common_error")}</div>
        )}

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
