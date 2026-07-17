import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { asyncHandler, ApiError } from "../lib/errors";
import { tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { hasPermission, requirePermission } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import { applyPunch, punchCreateSchema } from "../services/punch";
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
