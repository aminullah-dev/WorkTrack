import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CompanyDeletion } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const state = vi.hoisted(() => ({
  deletion: { status: "NONE", requestedAt: null, requestedBy: null, purgeAfter: null, reason: null, graceDays: 30 } as CompanyDeletion,
  permissions: new Set<string>(),
  requested: [] as unknown[],
  cancelled: 0,
}));

vi.mock("../api/hooks", () => ({
  useCompanyDeletion: () => ({ data: state.deletion, isLoading: false, isError: false, refetch: vi.fn() }),
  useRequestCompanyDeletion: () => ({
    mutateAsync: vi.fn(async (b: unknown) => { state.requested.push(b); return state.deletion; }),
    isPending: false,
  }),
  useCancelCompanyDeletion: () => ({
    mutateAsync: vi.fn(async () => { state.cancelled += 1; return state.deletion; }),
    isPending: false,
  }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => state.permissions.has(p),
  useAuth: () => ({ me: { companyName: "شرکت ساختمانی کابل" } }),
}));

const { DangerZoneCard } = await import("./DangerZoneCard");

function renderCard() {
  return render(<LocaleProvider><DangerZoneCard /></LocaleProvider>);
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  state.deletion = { status: "NONE", requestedAt: null, requestedBy: null, purgeAfter: null, reason: null, graceDays: 30 };
  state.permissions = new Set(["company:delete"]);
  state.requested = [];
  state.cancelled = 0;
});

describe("closing the company account", () => {
  it("is invisible to anyone who is not a company admin", () => {
    state.permissions = new Set(["settings:write", "payroll:run"]);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it("spells out what closing destroys before asking", () => {
    renderCard();
    fireEvent.click(screen.getByText("Close the company account", { selector: "button" }));
    expect(screen.getByText("Every attendance and leave record")).toBeInTheDocument();
    expect(screen.getByText("Every payroll run, payslip and ledger entry")).toBeInTheDocument();
    expect(screen.getByText("The login of every employee and kiosk")).toBeInTheDocument();
  });

  it("keeps the confirm button dead until the name is typed exactly", () => {
    renderCard();
    fireEvent.click(screen.getByText("Close the company account", { selector: "button" }));
    const confirm = screen.getByText("Yes, close the account").closest("button")!;
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("شرکت ساختمانی کابل"), {
      target: { value: "شرکت" },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("شرکت ساختمانی کابل"), {
      target: { value: "شرکت ساختمانی کابل" },
    });
    expect(confirm).toBeEnabled();
  });

  it("sends the typed name when confirmed", () => {
    renderCard();
    fireEvent.click(screen.getByText("Close the company account", { selector: "button" }));
    fireEvent.change(screen.getByPlaceholderText("شرکت ساختمانی کابل"), {
      target: { value: "شرکت ساختمانی کابل" },
    });
    fireEvent.click(screen.getByText("Yes, close the account"));
    expect(state.requested).toHaveLength(1);
  });

  it("forgets a half-typed name when the dialog is dismissed", () => {
    renderCard();
    fireEvent.click(screen.getByText("Close the company account", { selector: "button" }));
    fireEvent.change(screen.getByPlaceholderText("شرکت ساختمانی کابل"), {
      target: { value: "شرکت ساختمانی کابل" },
    });
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Close the company account", { selector: "button" }));
    expect(screen.getByText("Yes, close the account").closest("button")).toBeDisabled();
  });

  it("leads with the countdown when a closure is already scheduled", () => {
    state.deletion = {
      status: "SCHEDULED", requestedAt: "2026-08-01T00:00:00Z", requestedBy: "admin",
      purgeAfter: "2026-08-31", reason: null, graceDays: 30,
    };
    renderCard();
    expect(screen.getByText("This account is scheduled to close")).toBeInTheDocument();
    // 31 August 2026 is 9 Sunbula 1405.
    expect(screen.getByText(/9 سنبله 1405/)).toBeInTheDocument();
  });

  it("offers no way to close an account that is already closing", () => {
    state.deletion = {
      status: "SCHEDULED", requestedAt: "2026-08-01T00:00:00Z", requestedBy: "admin",
      purgeAfter: "2026-08-31", reason: null, graceDays: 30,
    };
    renderCard();
    expect(screen.queryByText("Yes, close the account")).not.toBeInTheDocument();
  });

  it("cancels on request", () => {
    state.deletion = {
      status: "SCHEDULED", requestedAt: "2026-08-01T00:00:00Z", requestedBy: "admin",
      purgeAfter: "2026-08-31", reason: null, graceDays: 30,
    };
    renderCard();
    fireEvent.click(screen.getByText("Cancel and reactivate"));
    expect(state.cancelled).toBe(1);
  });
});
