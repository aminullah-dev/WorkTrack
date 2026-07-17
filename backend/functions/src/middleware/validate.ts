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
