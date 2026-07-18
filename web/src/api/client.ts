import { auth } from "../firebase";
import type { Envelope, Problem } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");

/** Typed API error carrying the RFC 7807 problem code and any field errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(detail);
  }

  get isUnauthenticated(): boolean {
    return this.status === 401 || this.code === "UNAUTHENTICATED";
  }
}

function ulid(): string {
  // Idempotency key for POSTs; simplicity over sortability is fine client-side.
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  ).toUpperCase();
}

async function authHeader(forceRefresh = false): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken(forceRefresh);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  idempotent?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, idempotent } = options;

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await authHeader()),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotent) headers["Idempotency-Key"] = ulid();

  let response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // One retry with a force-refreshed token to cover ID-token expiry.
  if (response.status === 401 && auth.currentUser) {
    response = await fetch(url, {
      method,
      headers: { ...headers, ...(await authHeader(true)) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: Problem = {};
  try {
    problem = (await response.json()) as Problem;
  } catch {
    // Non-JSON error body; fall through to status-based defaults.
  }
  return new ApiError(
    response.status,
    problem.code ?? `HTTP_${response.status}`,
    problem.detail ?? problem.title ?? response.statusText,
    problem.fieldErrors ?? {},
  );
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    request<Envelope<T>>(path, { query }).then((e) => e),
  post: <T>(path: string, body: unknown, idempotent = true) =>
    request<Envelope<T>>(path, { method: "POST", body, idempotent }),
  put: <T>(path: string, body: unknown) =>
    request<Envelope<T>>(path, { method: "PUT", body }),
};
