import { createPortal } from "react-dom";
import type { RunPayslipRow } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";

/**
 * The sheet a company prints, carries to the workers, and gets signed.
 *
 * Most workers here have no bank account. Pay is counted out in cash and a
 * signature or a thumbprint is taken against it, and without that sheet a
 * company cannot answer a tax inspector or a main contractor asking how it
 * knows the money arrived. Everything WorkTrack computes stops being usable at
 * the edge of the screen until this exists.
 *
 * So the design is driven by the paper, not by the app:
 *
 *   - The signature column is wide and EMPTY. It is the only column that
 *     matters at the moment of use, and a narrow one gets signed across.
 *   - Rows are numbered and keyed by employee code. Two people called احمد in
 *     one company is the ordinary case, and a signed line has to say which.
 *   - Totals are at the foot, because the person paying counts the money
 *     against them before they start.
 *   - No colour and no zebra striping: these are printed on whatever is in the
 *     office, and grey backgrounds swallow ink and hide pencil signatures.
 */
export function PaymentSheet({
  runId,
  rows,
  onClose,
}: {
  runId: string;
  rows: RunPayslipRow[];
  onClose: () => void;
}) {
  const { t, num, shamsiMonthName } = useI18n();
  const { me } = useAuth();

  // "1405_06" — the run id carries the Solar Hijri period the sheet is for.
  const [year, month] = runId.split("_");
  const period = `${shamsiMonthName(Number(month))} ${num(year)}`;

  const totalNet = rows.reduce((sum, r) => sum + r.net, 0);
  const totalGross = rows.reduce((sum, r) => sum + r.gross, 0);
  const currency = rows[0]?.currency ?? "AFN";
  const money = (n: number): string => num(n.toLocaleString("en-US"));

  // Rendered into <body>, not into the React tree where it is written.
  //
  // The print stylesheet hides `body > *:not(.sheet-backdrop)` — that is what
  // puts the sheet alone on the paper. Left inside #root, that rule hides #root
  // and takes the sheet down with it, and printing produces a blank page. Every
  // test passed anyway: jsdom does not print, and the modal looked right on
  // screen. Only opening the browser showed it.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="print-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Screen-only controls. `no-print` removes them from the paper. */}
        <div className="no-print sheet-toolbar">
          <button className="btn btn-primary" onClick={() => window.print()}>
            {t("sheet_print")}
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            {t("common_close")}
          </button>
        </div>

        <header className="sheet-head">
          <h1>{t("sheet_title")}</h1>
          <div className="sheet-meta">
            <span>{me?.companyName}</span>
            <span>{t("sheet_period", period)}</span>
          </div>
        </header>

        <table className="sheet-table">
          <thead>
            <tr>
              <th style={{ width: "4%" }}>{t("sheet_row")}</th>
              <th style={{ width: "10%" }}>{t("sheet_code")}</th>
              <th style={{ width: "24%" }}>{t("sheet_name")}</th>
              <th style={{ width: "14%" }}>{t("sheet_gross")}</th>
              <th style={{ width: "14%" }}>{t("sheet_deductions")}</th>
              <th style={{ width: "14%" }}>{t("sheet_net")}</th>
              {/* The reason the page exists. */}
              <th style={{ width: "20%" }}>{t("sheet_signature")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{num(i + 1)}</td>
                <td>{num(r.employeeCode || "—")}</td>
                <td>{r.employeeName}</td>
                <td>{money(r.gross)}</td>
                <td>{money(r.totalDeductions)}</td>
                <td className="sheet-net">{money(r.net)}</td>
                <td className="sheet-sign" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t("sheet_total", num(rows.length))}</td>
              <td>{money(totalGross)}</td>
              <td>{money(totalGross - totalNet)}</td>
              <td className="sheet-net">
                {money(totalNet)} {currency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        {/* Who counted the money out, and who checked. An unsigned sheet proves
            nothing about the person who handed the cash over. */}
        <div className="sheet-signoff">
          <div>
            <span>{t("sheet_paid_by")}</span>
            <div className="sheet-rule" />
          </div>
          <div>
            <span>{t("sheet_approved_by")}</span>
            <div className="sheet-rule" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The same run as a spreadsheet.
 *
 * Every accountant here works in Excel and will go on doing so. A figure that
 * only exists on a screen gets retyped, and a retyped payroll is a payroll
 * with a typo in it.
 */
export function payrollCsv(rows: RunPayslipRow[]): string {
  const header = [
    "employee_code",
    "employee_name",
    "gross",
    "income_tax",
    "total_deductions",
    "net",
    "currency",
    "worked_days",
    "lop_days",
  ];

  // Latin digits and a plain comma on purpose: this file is read by Excel, not
  // by a person. Eastern digits arrive as text and every column stops adding
  // up, which is the one thing the accountant opened it for.
  const escape = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = rows.map((r) =>
    [
      r.employeeCode,
      r.employeeName,
      r.gross,
      r.incomeTax,
      r.totalDeductions,
      r.net,
      r.currency,
      r.workedDays,
      r.lopDays,
    ]
      .map(escape)
      .join(","),
  );

  // A BOM, so Excel on Windows reads the Dari names as UTF-8 rather than as
  // mojibake. Without it the whole name column is unreadable.
  return `﻿${header.join(",")}\n${lines.join("\n")}\n`;
}
