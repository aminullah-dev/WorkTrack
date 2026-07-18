import { Router } from "express";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { asyncHandler } from "../lib/errors";
import { tenant } from "../lib/firestore";
import type { TenantCollection } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { parseBody } from "../middleware/validate";
import { applyPunch, punchCreateSchema } from "../services/punch";
import { createLeaveRequest, leaveCreateSchema } from "../services/leave";
import { createRegularization, regularizationCreateSchema } from "../services/regularization";
import { kioskSecret } from "../config";

export const syncRouter = Router();

// ---------------------------------------------------------------------- push

const syncOpSchema = z.object({
  opId: z.string().min(1),
  opType: z.enum(["CREATE", "UPDATE", "DELETE"]),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  payload: z.record(z.unknown()),
});

const syncPushSchema = z.object({
  ops: z.array(syncOpSchema).min(1).max(100),
});

/**
 * Batched outbox drain. Each op is applied independently and idempotently
 * (client-generated ULIDs make replays no-ops); business rejections come back
 * as per-op REJECTED results, never batch failures.
 */
syncRouter.post(
  "/push",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { ops } = parseBody(req, syncPushSchema);

    const results = [];
    for (const op of ops) {
      try {
        if (op.opType !== "CREATE") {
          throw ApiError.business(
            ErrorCodes.UNSUPPORTED_RESOURCE,
            `${op.opType} is not supported via sync for ${op.resourceType}`,
          );
        }
        const resource = await applyOp(auth.companyId, auth.employeeId, op.resourceType, op.payload);
        results.push({ opId: op.opId, status: "APPLIED", resource });
      } catch (err) {
        if (err instanceof ApiError) {
          results.push({
            opId: op.opId,
            status: "REJECTED",
            errorCode: err.code,
            message: err.detail,
          });
        } else {
          // Infrastructure failure: fail the batch so the client retries it whole.
          throw err;
        }
      }
    }
    res.json({ data: { results } });
  }),
);

async function applyOp(
  cid: string,
  employeeId: string,
  resourceType: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (resourceType) {
    case "punches":
      return applyPunch(cid, employeeId, punchCreateSchema.parse(payload), kioskSecret.value());
    case "leaveRequests":
      return createLeaveRequest(cid, employeeId, leaveCreateSchema.parse(payload));
    case "regularizations":
      return createRegularization(cid, employeeId, regularizationCreateSchema.parse(payload));
    default:
      throw ApiError.business(
        ErrorCodes.UNSUPPORTED_RESOURCE,
        `Resource type ${resourceType} cannot be pushed`,
      );
  }
}

// ---------------------------------------------------------------------- pull

/** How each resource type is scoped for delta pull. */
type PullScope = "company" | "employee" | "employeeOrApprover" | "self";

const PULL_REGISTRY: Record<string, { collection: TenantCollection; scope: PullScope }> = {
  branches: { collection: "branches", scope: "company" },
  geofences: { collection: "geofences", scope: "company" },
  employees: { collection: "employees", scope: "self" },
  shifts: { collection: "shifts", scope: "company" },
  shiftAssignments: { collection: "shiftAssignments", scope: "employee" },
  leaveTypes: { collection: "leaveTypes", scope: "company" },
  leaveBalances: { collection: "leaveBalances", scope: "employee" },
  leaveRequests: { collection: "leaveRequests", scope: "employeeOrApprover" },
  regularizations: { collection: "regularizations", scope: "employeeOrApprover" },
  punches: { collection: "punches", scope: "employee" },
  attendanceDays: { collection: "attendanceDays", scope: "employee" },
  payslips: { collection: "payslips", scope: "employee" },
  announcements: { collection: "announcements", scope: "company" },
};

/**
 * Delta pull for one resource type. Cursor = `${updatedAtMillis}_${docId}`;
 * pagination orders by (updatedAt, __name__) so equal timestamps never skip.
 */
syncRouter.get(
  "/pull",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const type = String(req.query.type ?? "");
    const entry = PULL_REGISTRY[type];
    if (!entry) {
      throw ApiError.validation(`Unknown resource type '${type}'`);
    }
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "500"), 10) || 500, 500);
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    const queries = buildQueries(auth.companyId, auth.employeeId, entry);

    // Merge the (1-2) scoped queries client-side; page size stays bounded.
    const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let query of queries) {
      query = query.orderBy("updatedAt", "asc").orderBy(FieldPath.documentId(), "asc");
      if (cursor) {
        const [millisRaw, docId] = splitCursor(cursor);
        query = query.startAfter(Timestamp.fromMillis(millisRaw), docId);
      }
      const snap = await query.limit(limit).get();
      docs.push(...snap.docs);
    }

    docs.sort((a, b) => {
      const ta = (a.data().updatedAt as Timestamp).toMillis();
      const tb = (b.data().updatedAt as Timestamp).toMillis();
      return ta !== tb ? ta - tb : a.id.localeCompare(b.id);
    });
    const page = dedupeById(docs).slice(0, limit);

    const last = page[page.length - 1];
    const nextCursor = last
      ? `${(last.data().updatedAt as Timestamp).toMillis()}_${last.id}`
      : cursor;

    res.json({
      data: {
        resourceType: type,
        items: page.map((doc) => serializeDoc(doc.id, doc.data())),
        nextCursor,
        hasMore: page.length === limit,
      },
    });
  }),
);

function buildQueries(
  cid: string,
  employeeId: string,
  entry: { collection: TenantCollection; scope: PullScope },
): Query[] {
  const base = tenant(cid, entry.collection);
  switch (entry.scope) {
    case "company":
      return [base];
    case "employee":
      return [base.where("employeeId", "==", employeeId)];
    case "employeeOrApprover":
      return [
        base.where("employeeId", "==", employeeId),
        base.where("currentApproverId", "==", employeeId),
      ];
    case "self":
      return [base.where(FieldPath.documentId(), "==", employeeId)];
  }
}

function splitCursor(cursor: string): [number, string] {
  const separator = cursor.indexOf("_");
  const millis = Number.parseInt(cursor.slice(0, separator), 10);
  if (separator < 0 || Number.isNaN(millis)) {
    throw ApiError.validation("Malformed cursor");
  }
  return [millis, cursor.slice(separator + 1)];
}

function dedupeById(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): FirebaseFirestore.QueryDocumentSnapshot[] {
  const seen = new Set<string>();
  return docs.filter((doc) => {
    if (seen.has(doc.ref.path)) {
      return false;
    }
    seen.add(doc.ref.path);
    return true;
  });
}

/** Doc -> wire DTO: id injected, Timestamps to ISO strings (deep). */
function serializeDoc(id: string, data: Record<string, unknown>): Record<string, unknown> {
  return { id, ...convertTimestamps(data) };
}

function convertTimestamps(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw instanceof Timestamp) {
      out[key] = raw.toDate().toISOString();
    } else if (Array.isArray(raw)) {
      out[key] = raw.map((item) =>
        item !== null && typeof item === "object" && !(item instanceof Timestamp)
          ? convertTimestamps(item as Record<string, unknown>)
          : item instanceof Timestamp
            ? item.toDate().toISOString()
            : item,
      );
    } else if (raw !== null && typeof raw === "object") {
      out[key] = convertTimestamps(raw as Record<string, unknown>);
    } else {
      out[key] = raw;
    }
  }
  return out;
}
