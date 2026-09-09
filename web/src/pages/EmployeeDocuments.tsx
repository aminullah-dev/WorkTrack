import { type FormEvent, useState } from "react";
import {
  useAddDocument,
  useDeleteDocument,
  useEmployeeDocuments,
} from "../api/hooks";
import { ApiError } from "../api/client";
import type { DocumentType, EmployeeDocument } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";
import { Chip } from "../ui/components";

const TYPES: DocumentType[] = [
  "TAZKIRA",
  "CONTRACT",
  "WORK_PERMIT",
  "HEALTH_CERTIFICATE",
  "LICENCE",
  "OTHER",
];

/**
 * The papers held for one person, inside their record.
 *
 * A register, not a filing cabinet: what the document is, its number, and when
 * it stops being valid. The scan itself needs storage and an access decision
 * of its own, and the expiry warning is worth having long before the
 * photograph is.
 */
export function EmployeeDocuments({ employeeId }: { employeeId: string | null }) {
  const { t, num, shamsi } = useI18n();
  const documents = useEmployeeDocuments(employeeId);
  const remove = useDeleteDocument();
  const [adding, setAdding] = useState(false);

  if (!employeeId) return null;
  const rows = documents.data ?? [];

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>{t("doc_title")}</label>

      {rows.length === 0 ? (
        <p className="sub" style={{ margin: "4px 0 8px" }}>{t("doc_empty")}</p>
      ) : (
        <ul className="doc-list">
          {rows.map((d) => (
            <li key={d.id}>
              <span className="doc-type">{t(`doc_type_${d.type.toLowerCase()}`)}</span>
              {d.number && <span className="doc-number" dir="ltr">{num(d.number)}</span>}
              <ExpiryChip document={d} />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={remove.isPending}
                onClick={() => void remove.mutateAsync(d.id).catch(() => undefined)}
              >
                {t("doc_delete")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <DocumentForm
          employeeId={employeeId}
          onDone={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setAdding(true)}
        >
          {t("doc_add")}
        </button>
      )}
    </div>
  );

  function ExpiryChip({ document }: { document: EmployeeDocument }) {
    if (!document.expiresOn) {
      // Not the same as valid. A register that shows every permanent document
      // as "valid" teaches people to ignore the column.
      return <Chip tone="neutral">{t("doc_no_expiry")}</Chip>;
    }
    const days = daysUntil(document.expiresOn);
    const tone = days < 0 ? "negative" : days <= 30 ? "warning" : "positive";
    return (
      <Chip tone={tone}>
        {days < 0
          ? t("doc_expired", shamsi(document.expiresOn, { withYear: true }))
          : t("doc_expires", shamsi(document.expiresOn, { withYear: true }))}
      </Chip>
    );
  }
}

function DocumentForm({
  employeeId,
  onDone,
}: {
  employeeId: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const add = useAddDocument();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "CONTRACT" as DocumentType,
    number: "",
    expiresOn: "",
  });

  async function onSubmit(e: FormEvent): Promise<void> {
    // This sits inside the employee form, so a submit here must not submit
    // that one.
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    try {
      await add.mutateAsync({
        employeeId,
        type: form.type,
        number: form.number.trim() || null,
        // Empty means "does not expire" rather than "unknown" — the register
        // has no use for a date somebody meant to fill in later.
        expiresOn: form.expiresOn || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common_error"));
    }
  }

  return (
    <div className="doc-form">
      <div className="form-grid">
        <div className="field">
          <label>{t("doc_type")}</label>
          <select
            className="select"
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DocumentType }))}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`doc_type_${type.toLowerCase()}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t("doc_number")}</label>
          <input
            className="input"
            dir="ltr"
            value={form.number}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          />
        </div>
      </div>

      <div className="field">
        <label>{t("doc_expires_on")}</label>
        <input
          className="input"
          type="date"
          dir="ltr"
          value={form.expiresOn}
          onChange={(e) => setForm((f) => ({ ...f, expiresOn: e.target.value }))}
        />
        <span className="sub" style={{ fontSize: ".85em" }}>{t("doc_expires_hint")}</span>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="row-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onDone}>
          {t("common_cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={add.isPending}
          onClick={(e) => void onSubmit(e)}
        >
          {add.isPending ? t("common_saving") : t("common_save")}
        </button>
      </div>
    </div>
  );
}

function daysUntil(iso: string): number {
  const to = Date.parse(`${iso}T00:00:00Z`);
  const today = new Date();
  const from = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((to - from) / 86_400_000);
}
