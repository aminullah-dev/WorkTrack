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
import { localDateOf, weekOf } from "../services/attendance";
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
 * Which branch the caller is allowed to look at.
 *
 * A requested branchId used to win outright, so a BRANCH_MANAGER could read any
 * other branch's board simply by passing its id. It is now honoured only for
 * company-wide roles or a branch the caller actually belongs to; anything else
 * is refused rather than quietly narrowed, so the caller learns it was denied.
 */
function resolveBranchScope(
  auth: { roles: string[]; branchIds: string[] },
  requested: string | null,
): string | null {
  const companyWide =
    auth.roles.includes("COMPANY_ADMIN") ||
    auth.roles.includes("HR_ADMIN") ||
    auth.roles.includes("AUDITOR") ||
    auth.roles.includes("SUPER_ADMIN");

  if (companyWide) {
    return requested;
  }
  if (requested !== null) {
    if (!auth.branchIds.includes(requested)) {
      throw ApiError.permissionDenied("Not a member of that branch");
    }
    return requested;
  }
  return auth.branchIds[0] ?? null;
}


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

    const branchFilter = resolveBranchScope(
      auth,
      req.query.branchId ? String(req.query.branchId) : null,
    );

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
        // The photo itself is deliberately NOT sent here. This board carries up
        // to 500 rows and the portal refreshes it every minute; a ~200 KB base64
        // selfie per row made the response tens of megabytes. The flag lets the
        // portal show a thumbnail affordance and fetch the image on demand.
        hasCheckInSelfie: Boolean(day?.checkInSelfie),
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

/**
 * One week of attendance for the whole team, for the manager's weekly review.
 *
 * The daily board answers "who is in right now"; this answers "how did the week
 * go" — which needs the days side by side rather than one at a time. Weeks run
 * Saturday to Friday, the Afghan working week, and dates are resolved in the
 * company timezone like every other attendance date.
 */
attendanceRouter.get(
  "/weekly",
  requirePermission("attendance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const settings = await getSettings(auth.companyId);
    const timezone = settings.profile.timezone;

    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? ""))
      ? String(req.query.date)
      : localDateOf(new Date(), timezone);
    const dates = weekOf(anchor);

    const branchFilter = resolveBranchScope(
      auth,
      req.query.branchId ? String(req.query.branchId) : null,
    );

    let employeesQuery = tenant(auth.companyId, "employees").where("status", "==", "ACTIVE");
    if (branchFilter) {
      employeesQuery = employeesQuery.where("branchId", "==", branchFilter);
    }

    interface DayDoc {
      employeeId: string;
      date: string;
      status?: string;
      workedMinutes?: number;
      lateMinutes?: number;
      needsReview?: boolean;
      rejectedCount?: number;
    }

    const [employeesSnap, daysSnap] = await Promise.all([
      employeesQuery.limit(500).get(),
      tenant(auth.companyId, "attendanceDays")
        .where("date", ">=", dates[0])
        .where("date", "<=", dates[dates.length - 1])
        .get(),
    ]);

    // employeeId -> date -> day
    const byEmployee = new Map<string, Map<string, DayDoc>>();
    for (const doc of daysSnap.docs) {
      const day = doc.data() as DayDoc;
      const forEmployee = byEmployee.get(day.employeeId) ?? new Map<string, DayDoc>();
      forEmployee.set(day.date, day);
      byEmployee.set(day.employeeId, forEmployee);
    }

    interface EmployeeRow {
      firstName: string;
      lastName: string;
      branchId?: string | null;
      status?: string;
    }
    const employees = new Map<string, EmployeeRow>();
    for (const doc of employeesSnap.docs) {
      employees.set(doc.id, doc.data() as EmployeeRow);
    }

    // Same rule as the daily board: someone who worked is never invisible,
    // even if they have since left or are not yet activated.
    const missingIds = [...byEmployee.keys()].filter((id) => !employees.has(id));
    if (missingIds.length > 0) {
      const extra = await db.getAll(
        ...missingIds.slice(0, 200).map((id) => tenant(auth.companyId, "employees").doc(id)),
      );
      for (const doc of extra) {
        if (!doc.exists) continue;
        const emp = doc.data() as EmployeeRow;
        if (branchFilter && (emp.branchId ?? null) !== branchFilter) continue;
        employees.set(doc.id, emp);
      }
    }

    const rows = [...employees.entries()].map(([employeeId, emp]) => {
      const forEmployee = byEmployee.get(employeeId);
      const days = dates.map((date) => {
        const day = forEmployee?.get(date);
        return {
          date,
          status: day?.status ?? "ABSENT",
          workedMinutes: day?.workedMinutes ?? 0,
          lateMinutes: day?.lateMinutes ?? 0,
          needsReview: day?.needsReview ?? false,
          rejectedCount: day?.rejectedCount ?? 0,
        };
      });
      return {
        employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
        employeeStatus: emp.status ?? "ACTIVE",
        branchId: emp.branchId ?? null,
        days,
        totalWorkedMinutes: days.reduce((sum, d) => sum + d.workedMinutes, 0),
        presentDays: days.filter((d) => d.status === "PRESENT" || d.status === "HALF_DAY").length,
        lateDays: days.filter((d) => d.lateMinutes > 0).length,
        needsReviewDays: days.filter((d) => d.needsReview || d.rejectedCount > 0).length,
      };
    });

    rows.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    res.json({ data: { from: dates[0], to: dates[dates.length - 1], dates, rows } });
  }),
);

/**
 * The check-in photo for one day, fetched only when a manager opens it.
 *
 * The board deliberately carries a boolean instead of the image; at 500 rows
 * refreshed every minute, inlining base64 photos made the response unusable.
 */
attendanceRouter.get(
  "/days/:employeeId/:date/selfie",
  requirePermission("attendance:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { employeeId, date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw ApiError.validation("date must be YYYY-MM-DD");
    }
    const snap = await tenant(auth.companyId, "attendanceDays")
      .doc(`${employeeId}_${date}`)
      .get();
    const selfie = (snap.data() as { checkInSelfie?: string } | undefined)?.checkInSelfie;
    if (!selfie) {
      throw ApiError.notFound("No check-in photo for that day");
    }
    res.json({ data: { selfie } });
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
