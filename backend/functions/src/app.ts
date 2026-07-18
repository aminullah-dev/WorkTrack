import cors from "cors";
import express from "express";
import { errorHandler } from "./lib/errors";
import { requireAuth } from "./middleware/auth";
import { meRouter } from "./routes/me";
import { attendanceRouter } from "./routes/attendance";
import { leaveRouter } from "./routes/leave";
import { payslipsRouter } from "./routes/payslips";
import { announcementsRouter } from "./routes/announcements";
import { employeesRouter } from "./routes/employees";
import { analyticsRouter } from "./routes/analytics";
import { syncRouter } from "./routes/sync";

/**
 * WorkTrack REST API v1. Middleware chain per request:
 *   cors -> json -> requireAuth (verify token + tenant claims) -> route
 *   (route-level RBAC) -> handler -> problem+json error handler.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated liveness probe for uptime monitoring.
  app.get("/v1/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  const v1 = express.Router();
  v1.use(requireAuth);
  v1.use("/me", meRouter);
  v1.use("/employees", employeesRouter);
  v1.use("/attendance", attendanceRouter);
  v1.use("/leave", leaveRouter);
  v1.use("/payslips", payslipsRouter);
  v1.use("/announcements", announcementsRouter);
  v1.use("/analytics", analyticsRouter);
  v1.use("/sync", syncRouter);
  app.use("/v1", v1);

  app.use(errorHandler);
  return app;
}
