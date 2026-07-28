import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createApp } from "./app";
import { kioskSecret } from "./config";
import { runAttendanceAudit } from "./services/integrity";

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
