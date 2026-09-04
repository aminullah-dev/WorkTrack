import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Firebase module so tests control the "signed-in" user and its token
// without initializing a real Firebase app. `vi.hoisted` runs before the hoisted
// `vi.mock` factory, so the shared state is safe to reference inside it.
const { getIdToken, authState } = vi.hoisted(() => {
  const getIdToken = vi.fn<(force?: boolean) => Promise<string>>();
  return {
    getIdToken,
    authState: { currentUser: null } as {
      currentUser: { getIdToken: typeof getIdToken } | null;
    },
  };
});
vi.mock("../firebase", () => ({ auth: authState }));

import { api, signupCompany, ApiError } from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getIdToken.mockReset();
  authState.currentUser = null;
});

describe("ApiError", () => {
  it("treats HTTP 401 as unauthenticated", () => {
    expect(new ApiError(401, "SOMETHING", "nope").isUnauthenticated).toBe(true);
  });

  it("treats the UNAUTHENTICATED code as unauthenticated regardless of status", () => {
    expect(new ApiError(403, "UNAUTHENTICATED", "nope").isUnauthenticated).toBe(true);
  });

  it("is not unauthenticated for ordinary errors", () => {
    expect(new ApiError(500, "INTERNAL", "boom").isUnauthenticated).toBe(false);
  });
});

describe("api.get", () => {
  it("returns the parsed envelope on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [{ id: "e1" }] }));
    const result = await api.get<{ id: string }[]>("/employees");
    expect(result).toEqual({ data: [{ id: "e1" }] });
  });

  it("attaches a bearer token when a user is signed in", async () => {
    authState.currentUser = { getIdToken };
    getIdToken.mockResolvedValue("tok-123");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    await api.get("/me");

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("omits the Authorization header when signed out", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await api.get("/public");
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("serializes defined query params and drops null/undefined", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    await api.get("/attendance", { from: "2026-07-01", to: undefined, page: 2, q: null });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("to")).toBe(false);
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("throws a typed ApiError carrying the RFC 7807 problem", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        code: "VALIDATION",
        detail: "Invalid input",
        fieldErrors: { email: "required" },
      }),
    );

    const error = await api.get("/employees").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe("Invalid input");
    expect(error.fieldErrors).toEqual({ email: "required" });
  });

  it("falls back to status-based defaults for a non-JSON error body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>oops</html>", { status: 503, statusText: "Service Unavailable" }),
    );
    const error = (await api.get("/x").catch((e) => e)) as ApiError;
    expect(error.code).toBe("HTTP_503");
    expect(error.message).toBe("Service Unavailable");
  });
});

describe("token refresh retry", () => {
  it("retries once with a force-refreshed token after a 401", async () => {
    authState.currentUser = { getIdToken };
    getIdToken.mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "UNAUTHENTICATED", detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const result = await api.get<{ ok: boolean }>("/me");

    expect(result).toEqual({ data: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getIdToken).toHaveBeenLastCalledWith(true);
    const retryHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh");
  });

  it("does not retry when signed out", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "UNAUTHENTICATED", detail: "no" }));
    await api.get("/me").catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("api.post", () => {
  it("sends an idempotency key and JSON body by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "new" } }));
    await api.post("/leave", { days: 2 });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Idempotency-Key"]).toMatch(/.+/);
    expect(init.body).toBe(JSON.stringify({ days: 2 }));
  });

  it("omits the idempotency key when disabled", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await api.post("/leave", { days: 2 }, false);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });
});

describe("signupCompany (public endpoint)", () => {
  it("unwraps the envelope data on success and sends no auth header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { companyId: "c1", employeeId: "e1" } }),
    );

    const result = await signupCompany({
      companyName: "Acme",
      adminFirstName: "A",
      adminLastName: "B",
      email: "a@b.com",
      password: "secret",
    });

    expect(result).toEqual({ companyId: "c1", employeeId: "e1" });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws an ApiError on a failed signup", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { code: "EMAIL_TAKEN", detail: "Email already registered" }),
    );
    const error = (await signupCompany({
      companyName: "Acme",
      adminFirstName: "A",
      adminLastName: "B",
      email: "taken@b.com",
      password: "secret",
    }).catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("EMAIL_TAKEN");
  });
});
