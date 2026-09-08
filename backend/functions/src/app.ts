import cors from "cors";
import express from "express";
import { isOriginAllowed } from "./lib/cors";
import { errorHandler } from "./lib/errors";
import { requireAuth } from "./middleware/auth";
import { enforceDeviceLicense } from "./middleware/deviceGuard";
import { vendorRouter } from "./routes/vendor";
import { supportRouter } from "./routes/support";
import { meRouter } from "./routes/me";
import { attendanceRouter } from "./routes/attendance";
import { leaveRouter } from "./routes/leave";
import { payslipsRouter } from "./routes/payslips";
import { announcementsRouter } from "./routes/announcements";
import { employeesRouter } from "./routes/employees";
import { analyticsRouter } from "./routes/analytics";
import { payrollRouter } from "./routes/payroll";
import { financeRouter } from "./routes/finance";
import { devicesRouter } from "./routes/devices";
import { calendarRouter } from "./routes/calendar";
import { companyRouter } from "./routes/company";
import { publicRouter } from "./routes/public";
import { settingsRouter } from "./routes/settings";
import { shiftsRouter } from "./routes/shifts";
import { workRouter } from "./routes/work";
import { kioskRouter } from "./routes/kiosk";
import { syncRouter } from "./routes/sync";

/**
 * WorkTrack REST API v1. Middleware chain per request:
 *   cors -> json -> requireAuth (verify token + tenant claims) -> route
 *   (route-level RBAC) -> handler -> problem+json error handler.
 */
export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      // Refusing an origin means omitting the CORS headers rather than failing
      // the request: the browser blocks the response, and a non-browser caller
      // (the Android app) is unaffected. Passing an Error here would turn every
      // unknown origin into a 500 instead.
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      maxAge: 3600,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated liveness probe for uptime monitoring.
  app.get("/v1/health", (_req, res) => {
    res.json({ data: { status: "ok" } });
  });

  // Public, unauthenticated routes (company self-signup) — mounted BEFORE the
  // auth middleware so a new company can be created without a token.
  app.use("/v1/public", publicRouter);

  // The vendor console. Mounted OUTSIDE the tenant router on purpose: requireAuth
  // demands cid/eid, which a vendor account does not have, and these routes take
  // the company id from the URL rather than the token. requireVendor is what
  // makes that safe — see middleware/vendor.ts.
  app.use("/v1/vendor", vendorRouter);

  const v1 = express.Router();
  v1.use(requireAuth);
  // Mounted before the device guard: a phone cannot claim its licence seat if
  // holding a seat is the precondition for being allowed to ask.
  v1.use("/devices", devicesRouter);
  // Also before the device guard, and for the same reason: the customer most
  // likely to need support is the one the licence has just locked out, and a
  // support channel they cannot reach when the product refuses them is not a
  // support channel.
  v1.use("/support", supportRouter);
  v1.use(enforceDeviceLicense);
  v1.use("/me", meRouter);
  v1.use("/employees", employeesRouter);
  v1.use("/attendance", attendanceRouter);
  v1.use("/leave", leaveRouter);
  v1.use("/payslips", payslipsRouter);
  v1.use("/payroll", payrollRouter);
  v1.use("/finance", financeRouter);
  v1.use("/announcements", announcementsRouter);
  v1.use("/analytics", analyticsRouter);
  v1.use("/shifts", shiftsRouter);
  v1.use("/work", workRouter);
  v1.use("/calendar", calendarRouter);
  v1.use("/company", companyRouter);
  v1.use("/settings", settingsRouter);
  v1.use("/kiosk", kioskRouter);
  v1.use("/sync", syncRouter);
  app.use("/v1", v1);

  app.use(errorHandler);
  return app;
}
