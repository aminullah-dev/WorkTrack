import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { companiesDueForPurge, purgeCompany } from "./services/companyDeletion";
import { createApp } from "./app";
import { kioskSecret } from "./config";
import { runAttendanceAudit } from "./services/integrity";
import { resetDemoTenant, DemoResetRefused } from "./services/demo-reset";

// Deploy marker: v1.1 (finance + face recognition endpoints).

/**
 * The WorkTrack REST API v1, served as a single HTTPS function behind
 * `https://api.worktrack.app` (Hosting rewrite or Cloud Load Balancer).
 * Scaling, TLS, and DDoS absorption are delegated to Google Front End.
 */
export const api = onRequest(
  {
    region: "us-central1",
    secrets: [kioskSecret],
    minInstances: 0,
    maxInstances: 100,
    concurrency: 80,
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  createApp(),
);

/**
 * Nightly check that attendance which was recorded actually reached the board.
 *
 * Runs after the Kabul day has closed, covering yesterday and today. Findings
 * are logged under ATTENDANCE_INTEGRITY and written to `integrityReports`, so
 * a repeat of the silent projection failure surfaces within a day instead of
 * whenever somebody happens to notice their staff marked absent.
 */
export const attendanceIntegrityAudit = onSchedule(
  {
    region: "us-central1",
    schedule: "every day 02:00",
    timeZone: "Asia/Kabul",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async () => {
    await runAttendanceAudit();
  },
);

/**
 * Nightly reset of the public demo tenant, so every visitor arrives to the same
 * clean company rather than to whatever the previous one typed in.
 *
 * Deployed to every project but harmless outside the demo: resetDemoTenant
 * refuses to touch a project that is not the demo one, and a refusal is logged
 * and swallowed rather than retried, so this cannot become a nightly alarm on
 * production.
 */
export const demoTenantReset = onSchedule(
  {
    region: "us-central1",
    schedule: "every day 03:30",
    timeZone: "Asia/Kabul",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    try {
      const outcome = await resetDemoTenant();
      console.log("DEMO_RESET", JSON.stringify(outcome));
    } catch (err) {
      if (err instanceof DemoResetRefused) {
        console.log("DEMO_RESET_SKIPPED", err.message);
        return;
      }
      throw err;
    }
  },
);

/**
 * Purges the company accounts whose grace period has elapsed.
 *
 * The destructive half of account closure. Every safeguard lives in
 * purgeCompany, which re-reads the request and refuses anything that is not an
 * explicit, matured, scheduled deletion — so this job cannot widen its own
 * blast radius, and a bug here deletes nothing.
 *
 * One company failing does not stop the rest: the failure is logged and the
 * loop continues, because a tenant stuck mid-purge is worse than a slow one.
 */
export const companyDeletionPurge = onSchedule(
  {
    region: "us-central1",
    schedule: "every day 04:00",
    timeZone: "Asia/Kabul",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    const due = await companiesDueForPurge(today);
    if (due.length === 0) return;

    console.warn("COMPANY_PURGE_START", JSON.stringify({ count: due.length, today }));
    for (const cid of due) {
      try {
        const result = await purgeCompany(cid, today);
        console.warn("COMPANY_PURGE_OK", JSON.stringify(result));
      } catch (err) {
        console.error(
          "COMPANY_PURGE_FAILED",
          JSON.stringify({ companyId: cid, error: (err as Error).message }),
        );
      }
    }
  },
);
