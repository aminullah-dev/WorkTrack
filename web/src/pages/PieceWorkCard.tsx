import { type FormEvent, useState } from "react";
import {
  useDeletePieceRecord,
  useEmployees,
  usePieceRecords,
  useRecordPieces,
} from "../api/hooks";
import { ApiError } from "../api/client";
import type { PieceRecord } from "../api/types";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { EmptyState, ErrorState, LoadingState, Toast } from "../ui/components";

/**
 * The workshop's piece book.
 *
 * For anybody paid per piece, these counts ARE their wage — payroll multiplies
 * the total in the period by their rate and that is the whole of their basic
 * pay. So this is not a reporting screen; it is the same kind of act as
 * setting a salary, and it is gated the same way.
 *
 * Entries are kept one per day rather than as a running monthly total, because
 * a total nobody can break down is a total nobody can dispute — and disputes
 * about piece counts are exactly what a workshop's book exists to settle.
 */
export function PieceWorkCard() {
  const { t, num, shamsi } = useI18n();
  const can = useHasPermission();
  const records = usePieceRecords();
  const employees = useEmployees({});
  const remove = useDeletePieceRecord();

  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const canWrite = can("payroll:run");

  function flash(message: string): void {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  async function onDelete(record: PieceRecord): Promise<void> {
    if (!window.confirm(t("piece_delete_confirm", record.employeeName))) return;
    try {
      await remove.mutateAsync(record.id);
      flash(t("piece_deleted"));
    } catch (err) {
      flash(err instanceof ApiError ? err.message : t("common_error"));
    }
  }

  const rows = records.data ?? [];

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <div className="card-head">
        <div>
          <h2>{t("piece_title")}</h2>
          <p className="sub">{t("piece_sub")}</p>
        </div>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            {t("piece_add")}
          </button>
        )}
      </div>

      {records.isLoading ? (
        <LoadingState />
      ) : records.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void records.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("piece_empty")} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("piece_employee")}</th>
                <th>{t("piece_date")}</th>
                <th>{t("piece_quantity")}</th>
                <th>{t("piece_note")}</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employeeName}</td>
                  <td>{shamsi(r.date, { withYear: true })}</td>
                  <td style={{ fontWeight: 600 }}>{num(r.quantity)}</td>
                  <td>{r.note ?? ""}</td>
                  {canWrite && (
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={remove.isPending}
                        onClick={() => void onDelete(r)}
                      >
                        {t("piece_delete")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PieceForm
          employees={(employees.data?.data ?? []).map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`.trim(),
          }))}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            flash(t("piece_saved"));
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </section>
  );
}

function PieceForm({
  employees,
  onClose,
  onSaved,
}: {
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const record = useRecordPieces();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    date: isoToday(),
    quantity: "",
    note: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    const quantity = Number(form.quantity);
    if (!form.employeeId || !Number.isFinite(quantity) || quantity <= 0) {
      setError(t("piece_err_required"));
      return;
    }

    try {
      await record.mutateAsync({
        employeeId: form.employeeId,
        date: form.date,
        quantity,
        note: form.note.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common_error"));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void onSubmit(e)}>
        <h2>{t("piece_add")}</h2>

        <div className="field">
          <label>{t("piece_employee")}</label>
          <select
            className="select"
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
          >
            <option value="">{t("piece_pick_employee")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>{t("piece_quantity")}</label>
            <input
              className="input"
              dir="ltr"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </div>
          <div className="field">
            <label>{t("piece_date")}</label>
            <input
              className="input"
              type="date"
              dir="ltr"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>{t("piece_note")}</label>
          <input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t("common_cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={record.isPending}>
            {record.isPending ? t("common_saving") : t("common_save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
