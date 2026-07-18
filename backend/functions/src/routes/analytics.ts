import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { tenant } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";

export const analyticsRouter = Router();

/**
 * Dashboard KPIs for a given day (defaults to today, server timezone).
 *
 * At small/medium tenant sizes this reads attendanceDays + counts directly. For
 * 100k-employee tenants these figures are served from the BigQuery rollup
 * instead (see docs/02); the response shape stays identical so the portal is
 * unaffected by that swap.
 */
analyticsRouter.get(
  "/kpis",
  requirePermission("attendance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? ""))
      ? String(req.query.date)
      : new Date().toISOString().slice(0, 10);

    const [employeesSnap, daysSnap, pendingLeaveSnap] = await Promise.all([
      tenant(auth.companyId, "employees").where("status", "==", "ACTIVE").count().get(),
      tenant(auth.companyId, "attendanceDays").where("date", "==", date).get(),
      tenant(auth.companyId, "leaveRequests").where("status", "==", "PENDING").count().get(),
    ]);

    const activeEmployees = employeesSnap.data().count;

    let present = 0;
    let late = 0;
    let onLeave = 0;
    let halfDay = 0;
    for (const doc of daysSnap.docs) {
      const day = doc.data() as { status: string; lateMinutes?: number };
      switch (day.status) {
        case "PRESENT":
          present += 1;
          if ((day.lateMinutes ?? 0) > 0) late += 1;
          break;
        case "HALF_DAY":
          halfDay += 1;
          break;
        case "LEAVE":
          onLeave += 1;
          break;
        default:
          break;
      }
    }
    const marked = present + halfDay + onLeave;
    const absent = Math.max(0, activeEmployees - marked);

    res.json({
      data: {
        date,
        activeEmployees,
        present,
        halfDay,
        late,
        onLeave,
        absent,
        pendingLeaveRequests: pendingLeaveSnap.data().count,
        attendanceRate:
          activeEmployees > 0 ? Math.round(((present + halfDay) / activeEmployees) * 100) : 0,
      },
    });
  }),
);

/**
 * 7-point attendance trend ending on `date` (present count per day). Powers the
 * dashboard sparkline. Solar Hijri labels are formatted client-side.
 */
analyticsRouter.get(
  "/attendance-trend",
  requirePermission("attendance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const end = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? ""))
      ? new Date(`${String(req.query.date)}T00:00:00Z`)
      : new Date();

    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 86_400_000);
      dates.push(d.toISOString().slice(0, 10));
    }

    const snap = await tenant(auth.companyId, "attendanceDays")
      .where("date", ">=", dates[0])
      .where("date", "<=", dates[dates.length - 1])
      .get();

    const presentByDate = new Map<string, number>(dates.map((d) => [d, 0]));
    for (const doc of snap.docs) {
      const day = doc.data() as { date: string; status: string };
      if (day.status === "PRESENT" || day.status === "HALF_DAY") {
        presentByDate.set(day.date, (presentByDate.get(day.date) ?? 0) + 1);
      }
    }

    res.json({
      data: {
        points: dates.map((d) => ({ date: d, present: presentByDate.get(d) ?? 0 })),
      },
    });
  }),
);
