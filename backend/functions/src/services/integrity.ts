import { Timestamp } from "firebase-admin/firestore";
import { db, nowTimestamp, tenant } from "../lib/firestore";
import { localTimeToUtc, type PunchDoc } from "./attendance";
import { getSettings } from "./settings";

/**
 * Catches attendance that was recorded but never made it onto the board.
 *
 * A missing Firestore index made every day projection fail to write for
 * weeks. The punches were all there, the error was in the log, and nobody
 * looked — the only visible symptom was staff showing as absent. This audits
 * the outcome rather than any particular cause: if an employee has punches
 * for a day, that day must exist and must be at least as new as its punches.
 */

export type IntegrityProblem = "MISSING_DAY" | "STALE_DAY";

export interface IntegrityFinding {
  companyId: string;
  employeeId: string;
  date: string;
  problem: IntegrityProblem;
  punchCount: number;
}

/** Punches for one company-local day, grouped by employee. */
async function punchesByEmployee(
  cid: string,
  date: string,
  timezone: string,
): Promise<Map<string, PunchDoc[]>> {
  const start = localTimeToUtc(date, "00:00", timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const snap = await tenant(cid, "punches")
    .where("punchedAt", ">=", Timestamp.fromDate(start))
    .where("punchedAt", "<", Timestamp.fromDate(end))
    .get();

  const byEmployee = new Map<string, PunchDoc[]>();
  for (const doc of snap.docs) {
    const punch = doc.data() as PunchDoc;
    // Refused punches are not expected to produce worked time, but they still
    // require a day document — that is where their reason is surfaced.
    const list = byEmployee.get(punch.employeeId) ?? [];
    list.push(punch);
    byEmployee.set(punch.employeeId, list);
  }
  return byEmployee;
}

/** Every employee/day in [dates] whose projection is missing or out of date. */
export async function auditAttendanceDays(
  cid: string,
  dates: string[],
  timezone: string,
): Promise<IntegrityFinding[]> {
  const findings: IntegrityFinding[] = [];

  for (const date of dates) {
    const byEmployee = await punchesByEmployee(cid, date, timezone);
    if (byEmployee.size === 0) {
      continue;
    }

    const refs = [...byEmployee.keys()].map((employeeId) =>
      tenant(cid, "attendanceDays").doc(`${employeeId}_${date}`),
    );
    const daySnaps = await db.getAll(...refs);

    [...byEmployee.entries()].forEach(([employeeId, punches], index) => {
      const snap = daySnaps[index];
      if (!snap.exists) {
        findings.push({
          companyId: cid,
          employeeId,
          date,
          problem: "MISSING_DAY",
          punchCount: punches.length,
        });
        return;
      }
      // A day computed before its newest punch has not seen that punch, which
      // is what a silently failed recompute looks like after the fact.
      const computedAt = (snap.data() as { computedAt?: Timestamp }).computedAt;
      const newestPunch = punches.reduce(
        (max, p) => (p.updatedAt.toMillis() > max ? p.updatedAt.toMillis() : max),
        0,
      );
      if (!computedAt || computedAt.toMillis() < newestPunch) {
        findings.push({
          companyId: cid,
          employeeId,
          date,
          problem: "STALE_DAY",
          punchCount: punches.length,
        });
      }
    });
  }

  return findings;
}

/** The company-local dates the daily audit covers: today and yesterday. */
export function auditWindow(now: Date, timezone: string): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Yesterday is included because a day is still accumulating punches until
  // its own midnight, so "today" alone would flag work in progress.
  return [fmt.format(new Date(now.getTime() - 24 * 60 * 60 * 1000)), fmt.format(now)];
}

export interface AuditReport {
  checkedAt: Timestamp;
  companiesChecked: number;
  findings: IntegrityFinding[];
}

/**
 * Audits every company and records the outcome.
 *
 * Findings are logged at error level with a stable marker so a log-based
 * alert can be attached to them, and stored so the result is visible without
 * reading logs at all.
 */
export async function runAttendanceAudit(now: Date = new Date()): Promise<AuditReport> {
  const companies = await db.collection("companies").select().get();
  const findings: IntegrityFinding[] = [];

  for (const company of companies.docs) {
    const timezone = (await getSettings(company.id)).profile.timezone;
    findings.push(...(await auditAttendanceDays(company.id, auditWindow(now, timezone), timezone)));
  }

  const report: AuditReport = {
    checkedAt: nowTimestamp(),
    companiesChecked: companies.size,
    findings,
  };

  if (findings.length > 0) {
    // ATTENDANCE_INTEGRITY is the string to alert on.
    console.error("ATTENDANCE_INTEGRITY", {
      findingCount: findings.length,
      companiesChecked: companies.size,
      sample: findings.slice(0, 20),
    });
  } else {
    console.log("ATTENDANCE_INTEGRITY ok", { companiesChecked: companies.size });
  }

  await db.collection("integrityReports").add(report);
  return report;
}
