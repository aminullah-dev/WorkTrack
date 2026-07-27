import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { asyncHandler, ApiError } from "../lib/errors";
import { db, tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { hasPermission, requirePermission } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import { applyPunch, punchCreateSchema } from "../services/punch";
import { embeddingSchema, verifyFace } from "../services/face";
import { signFaceToken } from "../lib/face-token";
import { localDateOf } from "../services/attendance";
import { getSettings } from "../services/settings";
import {
  createRegularization,
  decideRegularization,
  regularizationCreateSchema,
  regularizationDecisionSchema,
  regularizationToDto,
} from "../services/regularization";
import { kioskSecret } from "../config";

export const attendanceRouter = Router();

/**
 * Verify a face check-in: the app sends the on-device embedding of the person
 * at the camera; the server compares it to the caller's enrolled embedding.
 *
 * On a match the response carries a short-lived signed token. The punch that
 * follows must present that token to be recorded as face-verified — the client
 * cannot assert verification on its own.
 */
attendanceRouter.post(
  "/face/verify",
  requirePermission("self:punch"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { embedding } = parseBody(req, embeddingSchema);
    const result = await verifyFace(auth.companyId, auth.employeeId, embedding);
    const token = result.match
      ? signFaceToken(kioskSecret.value(), auth.employeeId)
      : null;
    res.json({ data: { ...result, token } });
  }),
);

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
    // Default to the company's calendar day, not UTC: days are filed in the
    // company zone, so a UTC default silently asks for the wrong one.
    const requestedDate = String(req.query.date ?? "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : localDateOf(new Date(), (await getSettings(auth.companyId)).profile.timezone);

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

    interface EmployeeRow {
      firstName: string;
      lastName: string;
      branchId?: string | null;
      status?: string;
    }
    const employeeDocs = new Map<string, EmployeeRow>();
    for (const doc of employeesSnap.docs) {
      employeeDocs.set(doc.id, doc.data() as EmployeeRow);
    }

    // Someone who clocked in must never be invisible here. Employees who are no
    // longer ACTIVE (left, suspended, still onboarding) are excluded from the
    // roster query above, so pull in any of them that actually have a day
    // record — otherwise their attendance silently vanishes from the board.
    const missingIds = [...dayByEmployee.keys()].filter((id) => !employeeDocs.has(id));
    if (missingIds.length > 0) {
      const refs = missingIds
        .slice(0, 200)
        .map((id) => tenant(auth.companyId, "employees").doc(id));
      const extra = await db.getAll(...refs);
      for (const doc of extra) {
        if (!doc.exists) continue;
        const emp = doc.data() as EmployeeRow;
        // Branch managers stay scoped to their own branch.
        if (branchFilter && (emp.branchId ?? null) !== branchFilter) continue;
        employeeDocs.set(doc.id, emp);
      }
    }

    const rows = [...employeeDocs.entries()].map(([employeeId, emp]) => {
      const day = dayByEmployee.get(employeeId);
      return {
        employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        branchId: emp.branchId ?? null,
        employeeStatus: emp.status ?? "ACTIVE",
        status: (day?.status as string | undefined) ?? "ABSENT",
        firstInAt: toIso((day?.firstInAt as Timestamp | undefined) ?? null),
        lastOutAt: toIso((day?.lastOutAt as Timestamp | undefined) ?? null),
        workedMinutes: (day?.workedMinutes as number | undefined) ?? 0,
        lateMinutes: (day?.lateMinutes as number | undefined) ?? 0,
        checkInSelfie: (day?.checkInSelfie as string | undefined) ?? null,
        checkInFaceVerified: (day?.checkInFaceVerified as boolean | undefined) ?? false,
        needsReview: (day?.needsReview as boolean | undefined) ?? false,
        // Punches the server refused, so the portal can explain an empty day.
        rejectedCount: (day?.rejectedCount as number | undefined) ?? 0,
        rejectedReason: (day?.rejectedReason as string | undefined) ?? null,
        rejectedAt: toIso((day?.rejectedAt as Timestamp | undefined) ?? null),
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
