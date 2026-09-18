import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { audit } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  DOCUMENT_TYPES,
  addDocument,
  deleteDocument,
  documentToDto,
  expiringDocuments,
  listDocuments,
} from "../services/employeeDocuments";
import { getSettings } from "../services/settings";
import { localDateOf } from "../services/attendance";

/**
 * The register of papers a company holds for its staff.
 *
 * Gated on employees:read / employees:write: a document is part of somebody's
 * personnel file, and whoever may see the file may see what is in it.
 */
export const documentsRouter = Router();

const createSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(DOCUMENT_TYPES),
  number: z.string().max(80).nullish(),
  issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  // Null for a document that does not expire — a tazkira. Not the same as
  // forgetting to fill it in, which is why it is explicit.
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(300).nullish(),
});

documentsRouter.get(
  "/",
  requirePermission("employees:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : null;
    res.json({ data: await listDocuments(auth.companyId, employeeId) });
  }),
);

/** What has run out, or is about to. The list somebody is meant to act on. */
documentsRouter.get(
  "/expiring",
  requirePermission("employees:read"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const settings = await getSettings(auth.companyId);
    // Dated in the company's own zone: "expires today" has to mean today where
    // the company is, not where the server happens to run.
    const today = localDateOf(new Date(), settings.profile.timezone);
    const within = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 365);
    res.json({ data: await expiringDocuments(auth.companyId, today, within) });
  }),
);

documentsRouter.post(
  "/",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const payload = parseBody(req, createSchema);

    const { id, doc } = await addDocument(
      auth.companyId,
      {
        employeeId: payload.employeeId,
        type: payload.type,
        number: payload.number ?? null,
        issuedOn: payload.issuedOn ?? null,
        expiresOn: payload.expiresOn ?? null,
        note: payload.note ?? null,
      },
      auth.employeeId,
    );

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "documents.create",
      resourceType: "documents",
      resourceId: id,
      after: { employeeId: payload.employeeId, type: payload.type, expiresOn: payload.expiresOn },
    });

    res.status(201).json({ data: documentToDto(id, doc) });
  }),
);

documentsRouter.delete(
  "/:id",
  requirePermission("employees:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deleteDocument(auth.companyId, req.params.id);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "documents.delete",
      resourceType: "documents",
      resourceId: req.params.id,
    });

    res.json({ data: { id: req.params.id } });
  }),
);
