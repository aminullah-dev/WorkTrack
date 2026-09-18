import { useState } from "react";
import { useDeleteHoliday, useHolidays, useSaveHoliday, useSeedHolidays } from "../api/hooks";
import { useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { shamsiToday, toShamsi } from "../shamsi/solarHijri";
import { Chip, EmptyState, ErrorState, LoadingState, Switch, Toast } from "../ui/components";

const SHAMSI_MONTHS = [
  "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
  "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت",
];

/**
 * The company's working calendar.
 *
 * This is what stops a closed office reading as absence. Weekends come from the
 * policy above; the days listed here are the ones the company closes on top of
 * that, and payroll excludes both.
 */
export function HolidaysCard() {
  const { t, num } = useI18n();
  const can = useHasPermission();
  const canManage = can("calendar:write");

  const today = shamsiToday();
  const [year, setYear] = useState(today.year);
  // A Shamsi year runs from ~21 March to ~20 March; ask the server for a
  // generous Gregorian window and let it filter.
  const from = `${year + 620}-03-01`;
  const to = `${year + 622}-04-01`;

  const holidays = useHolidays(from, to);
  const save = useSaveHoliday();
  const remove = useDeleteHoliday();
  const seed = useSeedHolidays();

  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [paid, setPaid] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  async function onAdd() {
    if (!date || !name.trim()) return;
    try {
      await save.mutateAsync({ date, name: name.trim(), paid });
      setDate("");
      setName("");
      setPaid(true);
      flash(t("hol_saved"));
    } catch {
      flash(t("common_error"));
    }
  }

  async function onSeed() {
    try {
      const r = await seed.mutateAsync(year);
      flash(r.added > 0 ? t("hol_seeded", num(r.added)) : t("hol_seed_none"));
    } catch {
      flash(t("common_error"));
    }
  }

  const rows = (holidays.data ?? []).filter((h) => {
    const s = toShamsi(h.date);
    return s.year === year;
  });

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 className="card-title">{t("hol_title")}</h2>
      <p className="section-hint">{t("hol_hint")}</p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBlockEnd: 14 }}>
        <label className="field" style={{ minWidth: 120 }}>
          <span className="label">{t("hol_year")}</span>
          <input
            className="input"
            type="number"
            dir="ltr"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || today.year)}
          />
        </label>
        {canManage && (
          <button className="btn btn-outline" disabled={seed.isPending} onClick={() => void onSeed()}>
            {seed.isPending ? t("common_saving") : t("hol_seed")}
          </button>
        )}
      </div>

      {canManage && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBlockEnd: 14 }}>
          <label className="field" style={{ minWidth: 160 }}>
            <span className="label">{t("hol_date")}</span>
            <input className="input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span className="label">{t("hol_name")}</span>
            <input
              className="input"
              placeholder={t("hol_name_ph")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBlockEnd: 8 }}>
            <Switch checked={paid} onChange={setPaid} label={t("hol_paid")} />
            <span>{t("hol_paid")}</span>
          </label>
          <button
            className="btn btn-primary"
            style={{ marginBlockEnd: 4 }}
            disabled={!date || !name.trim() || save.isPending}
            onClick={() => void onAdd()}
          >
            {save.isPending ? t("common_saving") : t("hol_add")}
          </button>
        </div>
      )}

      {holidays.isLoading ? (
        <LoadingState />
      ) : holidays.isError ? (
        <ErrorState message={t("common_error")} onRetry={() => void holidays.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message={t("hol_empty")} />
      ) : (
        <div className="table-wrap" style={{ boxShadow: "none", border: "none" }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t("hol_date")}</th>
                <th>{t("hol_name")}</th>
                <th>{t("hol_paid")}</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const s = toShamsi(h.date);
                return (
                  <tr key={h.date}>
                    <td>
                      <div>
                        {num(s.day)} {SHAMSI_MONTHS[s.month - 1]} {num(s.year)}
                      </div>
                      <div className="muted" dir="ltr" style={{ fontSize: 12 }}>
                        {h.date}
                      </div>
                    </td>
                    <td>
                      <div>{h.name}</div>
                      {h.source === "SOLAR_RECURRING" && (
                        <Chip tone="neutral">{t("hol_generated")}</Chip>
                      )}
                    </td>
                    <td>
                      <Chip tone={h.paid ? "positive" : "neutral"}>
                        {h.paid ? t("hol_paid_yes") : t("hol_paid_no")}
                      </Chip>
                    </td>
                    {canManage && (
                      <td style={{ textAlign: "end" }}>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={remove.isPending}
                          onClick={() => void remove.mutateAsync(h.date).catch(() => flash(t("common_error")))}
                        >
                          {t("hol_remove")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="section-hint" style={{ marginBlockStart: 12 }}>
        {t("hol_lunar_note")}
      </p>

      {toast && <Toast message={toast} />}
    </div>
  );
}
