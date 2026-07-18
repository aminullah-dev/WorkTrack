import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { asyncHandler, ApiError } from "../lib/errors";
import { tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { hasPermission, requirePermission } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import { applyPunch, punchCreateSchema } from "../services/punch";
import {
  createRegularization,
  decideRegularization,
  regularizationCreateSchema,
  regularizationDecisionSchema,
  regularizationToDto,
} from "../services/regularization";
import { kioskSecret } from "../config";

export const attendanceRouter = Router();

/** Direct online punch (web/kiosk clients; Android normally uses /sync/push). */
attendanceRouter.post(
  "/punches",
  requirePermission("self:punch"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, punchCreateSchema);

    const idempotencyKey = req.header("Idempotency-Key");
    if (idempotencyKey) {
      const replay = await checkIdempotency(auth.companyId, idempotencyKey);
      if (replay !== null) {
        res.json({ data: replay });
        return;
      }
    }

    const dto = await applyPunch(auth.companyId, auth.employeeId, payload, kioskSecret.value());

    if (idempotencyKey) {
      await recordIdempotency(auth.companyId, idempotencyKey, dto);
    }
    res.status(201).json({ data: dto });
  }),
);

// -------------------------------------------------------- regularizations

/** Employee files a correction request for a day (online path; app uses sync). */
attendanceRouter.post(
  "/regularizations",
  requirePermission("self:attendance"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, regularizationCreateSchema);
    const dto = await createRegularization(auth.companyId, auth.employeeId, payload);
    res.status(201).json({ data: dto });
  }),
);

/** scope=mine (default) or scope=approvals (waiting on the caller). */
attendanceRouter.get(
  "/regularizations",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const scope = String(req.query.scope ?? "mine");
    if (scope === "approvals" && !hasPermission(auth.roles, "attendance:approve")) {
      throw ApiError.permissionDenied("Requires attendance:approve");
    }
    const query =
      scope === "approvals"
        ? tenant(auth.companyId, "regularizations")
            .where("currentApproverId", "==", auth.employeeId)
            .limit(200)
        : tenant(auth.companyId, "regularizations")
            .where("employeeId", "==", auth.employeeId)
            .limit(200);
    const snapshot = await query.get();
    res.json({
      data: snapshot.docs.map((doc) =>
        regularizationToDto(doc.id, doc.data() as Parameters<typeof regularizationToDto>[1]),
      ),
    });
  }),
);

attendanceRouter.post(
  "/regularizations/:id/decide",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    if (!hasPermission(auth.roles, "attendance:approve")) {
      throw ApiError.permissionDenied("Requires attendance:approve");
    }
    const payload = parseBody(req, regularizationDecisionSchema);
    const dto = await decideRegularization(
      auth.companyId,
      req.params.id,
      auth.employeeId,
      auth.roles,
      payload.decision,
      payload.note ?? null,
    );
    res.json({ data: dto });
  }),
);

/**
 * Manager live board: every employee's attendance status for one day, joined
 * with employee name/branch. Branch managers are scoped to their branch(es).
 */
attendanceRouter.get(
  "/overview",
  requirePermission("attendance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? ""))
      ? String(req.query.date)
      : new Date().toISOString().slice(0, 10);

    const companyWide =
      auth.roles.includes("COMPANY_ADMIN") ||
      auth.roles.includes("HR_ADMIN") ||
      auth.roles.includes("AUDITOR") ||
      auth.roles.includes("SUPER_ADMIN");
    const branchFilter =
      (req.query.branchId ? String(req.query.branchId) : null) ??
      (!companyWide ? auth.branchIds[0] ?? null : null);

    let employeesQuery = tenant(auth.companyId, "employees").where("status", "==", "ACTIVE");
    if (branchFilter) {
      employeesQuery = employeesQuery.where("branchId", "==", branchFilter);
    }
    const [employeesSnap, daysSnap] = await Promise.all([
      employeesQuery.limit(500).get(),
      tenant(auth.companyId, "attendanceDays").where("date", "==", date).get(),
    ]);

    const dayByEmployee = new Map<string, Record<string, unknown>>();
    for (const doc of daysSnap.docs) {
      const day = doc.data() as { employeeId: string };
      dayByEmployee.set(day.employeeId, day as Record<string, unknown>);
    }

    const rows = employeesSnap.docs.map((doc) => {
      const emp = doc.data() as { firstName: string; lastName: string; branchId?: string | null };
      const day = dayByEmployee.get(doc.id);
      return {
        employeeId: doc.id,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        branchId: emp.branchId ?? null,
        status: (day?.status as string | undefined) ?? "ABSENT",
        firstInAt: toIso((day?.firstInAt as Timestamp | undefined) ?? null),
        lastOutAt: toIso((day?.lastOutAt as Timestamp | undefined) ?? null),
        workedMinutes: (day?.workedMinutes as number | undefined) ?? 0,
        lateMinutes: (day?.lateMinutes as number | undefined) ?? 0,
      };
    });

    res.json({ data: { date, rows } });
  }),
);

/** Attendance day projections for a date window (self, or any employee with attendance:read). */
attendanceRouter.get(
  "/days",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw ApiError.validation("from/to must be ISO dates (YYYY-MM-DD)");
    }

    const requested = String(req.query.employeeId ?? auth.employeeId);
    if (requested !== auth.employeeId && !hasPermission(auth.roles, "attendance:read")) {
      throw ApiError.permissionDenied("Requires attendance:read for other employees");
    }

    const snapshot = await tenant(auth.companyId, "attendanceDays")
      .where("employeeId", "==", requested)
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "desc")
      .limit(400)
      .get();

    res.json({
      data: snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          employeeId: d.employeeId,
          date: d.date,
          shiftId: d.shiftId ?? null,
          firstInAt: toIso(d.firstInAt as Timestamp | null),
          lastOutAt: toIso(d.lastOutAt as Timestamp | null),
          workedMinutes: d.workedMinutes ?? 0,
          lateMinutes: d.lateMinutes ?? 0,
          earlyOutMinutes: d.earlyOutMinutes ?? 0,
          overtimeMinutes: d.overtimeMinutes ?? 0,
          status: d.status ?? "PENDING",
          updatedAt: toIso(d.updatedAt as Timestamp | null),
        };
      }),
    });
  }),
);
