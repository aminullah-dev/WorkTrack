import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { ulid } from "../lib/ids";
import { audit, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";

export const announcementsRouter = Router();

announcementsRouter.get(
  "/",
  requirePermission("announcements:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const snapshot = await tenant(auth.companyId, "announcements")
      .where("publishedAt", "<=", nowTimestamp())
      .orderBy("publishedAt", "desc")
      .limit(100)
      .get();

    const now = Date.now();
    res.json({
      data: snapshot.docs
        .map((doc): Record<string, unknown> => ({ id: doc.id, ...doc.data() }))
        .filter((a) => {
          const expires = a.expiresAt as Timestamp | null | undefined;
          return !expires || expires.toMillis() > now;
        })
        .map((a) => ({
          ...a,
          publishedAt: toIso(a.publishedAt as Timestamp),
          expiresAt: toIso((a.expiresAt as Timestamp | null | undefined) ?? null),
          updatedAt: toIso(a.updatedAt as Timestamp),
        })),
    });
  }),
);

const announcementCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  publishAt: z.string().datetime().nullish(),
  expiresAt: z.string().datetime().nullish(),
});

announcementsRouter.post(
  "/",
  requirePermission("announcements:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, announcementCreateSchema);

    const id = ulid();
    const now = nowTimestamp();
    const doc = {
      companyId: auth.companyId,
      title: payload.title,
      body: payload.body,
      priority: payload.priority,
      publishedAt: payload.publishAt
        ? Timestamp.fromDate(new Date(payload.publishAt))
        : now,
      expiresAt: payload.expiresAt ? Timestamp.fromDate(new Date(payload.expiresAt)) : null,
      createdBy: auth.employeeId,
      createdByName: null,
      updatedAt: now,
    };
    await tenant(auth.companyId, "announcements").doc(id).create(doc);
    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "announcements.create",
      resourceType: "announcements",
      resourceId: id,
      after: { title: payload.title, priority: payload.priority },
    });

    res.status(201).json({
      data: {
        id,
        ...doc,
        publishedAt: toIso(doc.publishedAt),
        expiresAt: toIso(doc.expiresAt),
        updatedAt: toIso(doc.updatedAt),
      },
    });
  }),
);
