import type { NextFunction, Request, Response } from "express";

/** Canonical machine-readable error codes (mirrored by the Android client). */
export const ErrorCodes = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  IDEMPOTENCY_REPLAY: "IDEMPOTENCY_REPLAY",
  GEOFENCE_VIOLATION: "GEOFENCE_VIOLATION",
  KIOSK_TOKEN_INVALID: "KIOSK_TOKEN_INVALID",
  INSUFFICIENT_LEAVE_BALANCE: "INSUFFICIENT_LEAVE_BALANCE",
  INVALID_STATE: "INVALID_STATE",
  UNSUPPORTED_RESOURCE: "UNSUPPORTED_RESOURCE",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Application error carrying an HTTP status and a stable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly detail: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(detail);
  }

  static unauthenticated(detail = "Missing or invalid credentials"): ApiError {
    return new ApiError(401, ErrorCodes.UNAUTHENTICATED, detail);
  }

  static permissionDenied(detail = "Not allowed"): ApiError {
    return new ApiError(403, ErrorCodes.PERMISSION_DENIED, detail);
  }

  static notFound(detail = "Resource not found"): ApiError {
    return new ApiError(404, ErrorCodes.NOT_FOUND, detail);
  }

  static validation(detail: string, fieldErrors: Record<string, string> = {}): ApiError {
    return new ApiError(422, ErrorCodes.VALIDATION_FAILED, detail, fieldErrors);
  }

  static business(code: ErrorCode, detail: string): ApiError {
    return new ApiError(422, code, detail);
  }
}

/** RFC 7807 problem+json responder. */
export function sendProblem(res: Response, error: ApiError): void {
  res
    .status(error.status)
    .type("application/problem+json")
    .json({
      type: `https://api.worktrack.app/errors/${error.code}`,
      title: error.code,
      status: error.status,
      code: error.code,
      detail: error.detail,
      ...(Object.keys(error.fieldErrors).length > 0 ? { fieldErrors: error.fieldErrors } : {}),
    });
}

/** Terminal express error handler: everything unexpected becomes a 500 problem. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    sendProblem(res, err);
    return;
  }
  console.error("Unhandled API error", err);
  sendProblem(res, new ApiError(500, ErrorCodes.INTERNAL, "Internal server error"));
}

/** Wraps async handlers so rejections reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
