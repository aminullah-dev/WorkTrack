import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError, asyncHandler } from "../lib/errors";
import { tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { isApprover } from "../middleware/rbac";
import { checkIdempotency, recordIdempotency } from "../middleware/idempotency";
import { parseBody } from "../middleware/validate";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  decideLeaveRequest,
  leaveCreateSchema,
  leaveDecisionSchema,
  leaveRequestToDto,
} from "../services/leave";

export const leaveRouter = Router();

leaveRouter.get(
  "/types",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snapshot = await tenant(auth.companyId, "leaveTypes")
      .where("active", "==", true)
      .get();
    res.json({
      data: snapshot.docs.map((doc) => ({
        id: doc.id,
        companyId: auth.companyId,
        ...doc.data(),
        updatedAt: toIso(doc.data().updatedAt as Timestamp | null),
      })),
    });
  }),
);

leaveRouter.get(
  "/balances",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snapshot = await tenant(auth.companyId, "leaveBalances")
      .where("employeeId", "==", auth.employeeId)
      .get();
    res.json({
      data: snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        updatedAt: toIso(doc.data().updatedAt as Timestamp | null),
      })),
    });
  }),
);

/** scope=mine (default) or scope=approvals (requests waiting on the caller). */
leaveRouter.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const scope = String(req.query.scope ?? "mine");

    const query =
      scope === "approvals"
        ? tenant(auth.companyId, "leaveRequests")
            .where("currentApproverId", "==", auth.employeeId)
            .limit(200)
        : tenant(auth.companyId, "leaveRequests")
            .where("employeeId", "==", auth.employeeId)
            .limit(200);

    if (scope === "approvals" && !isApprover(auth.roles)) {
      throw ApiError.permissionDenied("Requires leave:approve");
    }

    const snapshot = await query.get();
    res.json({
      data: snapshot.docs.map((doc) =>
        leaveRequestToDto(doc.id, doc.data() as Parameters<typeof leaveRequestToDto>[1]),
      ),
    });
  }),
);

leaveRouter.post(
  "/requests",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, leaveCreateSchema);
    const dto = await createLeaveRequest(auth.companyId, auth.employeeId, payload);
    res.status(201).json({ data: dto });
  }),
);

leaveRouter.post(
  "/requests/:id/decide",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    if (!isApprover(auth.roles)) {
      throw ApiError.permissionDenied("Requires leave:approve");
    }
    const payload = parseBody(req, leaveDecisionSchema);

    const idempotencyKey = req.header("Idempotency-Key");
    if (idempotencyKey) {
      const replay = await checkIdempotency(auth.companyId, idempotencyKey);
      if (replay !== null) {
        res.json({ data: replay });
        return;
      }
    }

    const dto = await decideLeaveRequest(
      auth.companyId,
      req.params.id,
      auth.employeeId,
      auth.roles,
      payload.decision,
      payload.note ?? null,
    );
    if (idempotencyKey) {
      await recordIdempotency(auth.companyId, idempotencyKey, dto);
    }
    res.json({ data: dto });
  }),
);

leaveRouter.post(
  "/requests/:id/cancel",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const dto = await cancelLeaveRequest(auth.companyId, req.params.id, auth.employeeId);
    res.json({ data: dto });
  }),
);
