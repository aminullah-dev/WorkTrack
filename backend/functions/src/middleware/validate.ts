import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import { ApiError } from "../lib/errors";

/** Parses and validates a request body; zod issues become 422 field errors. */
export function parseBody<S extends ZodTypeAny>(req: Request, schema: S): z.output<S> {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!(path in fieldErrors)) {
        fieldErrors[path] = issue.message;
      }
    }
    throw ApiError.validation("Request body failed validation", fieldErrors);
  }
  return result.data;
}

/**
 * Same mapping for a payload that did not arrive as a request body — a sync
 * outbox op, for instance. Sync applies each op independently, so a malformed
 * one has to surface as a rejection for that op; letting a raw ZodError escape
 * would fail the whole batch and the client would resend it forever.
 */
export function parsePayload<S extends ZodTypeAny>(payload: unknown, schema: S): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!(path in fieldErrors)) {
        fieldErrors[path] = issue.message;
      }
    }
    throw ApiError.validation("Payload failed validation", fieldErrors);
  }
  return result.data;
}
