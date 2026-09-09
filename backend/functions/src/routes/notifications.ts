import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { authOf } from "../middleware/auth";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "../services/notifications";

/**
 * What the signed-in person needs to be told.
 *
 * No permission gate: a notification is addressed to one employee and every
 * handler is scoped to the caller's own id. There is nothing here that being
 * a manager should let somebody see more of, and nothing an employee should be
 * refused about their own leave.
 */
export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const [items, unread] = await Promise.all([
      listNotifications(auth.companyId, auth.employeeId),
      unreadCount(auth.companyId, auth.employeeId),
    ]);
    res.json({ data: { items, unread } });
  }),
);

notificationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await markRead(auth.companyId, auth.employeeId, req.params.id);
    res.json({ data: { id: req.params.id, read: true } });
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const marked = await markAllRead(auth.companyId, auth.employeeId);
    res.json({ data: { marked } });
  }),
);
