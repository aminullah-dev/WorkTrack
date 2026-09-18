import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BillingOrder, BillingOverview } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const state = vi.hoisted(() => ({
  billing: null as BillingOverview | null,
  orders: [] as BillingOrder[],
  returnedOrder: null as BillingOrder | null,
  permissions: new Set<string>(),
  checkout: vi.fn(),
}));

vi.mock("../api/hooks", () => ({
  useBilling: () => ({
    data: state.billing,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useBillingOrders: () => ({ data: state.orders, isLoading: false, isError: false }),
  useBillingOrder: () => ({ data: state.returnedOrder, isLoading: false, isError: false }),
  useStartCheckout: () => ({ mutateAsync: state.checkout, isPending: false }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => state.permissions.has(p),
}));

const { BillingPage } = await import("./BillingPage");

function plan(over: Partial<BillingOverview["plans"][number]> = {}) {
  return {
    id: "BRONZE" as const,
    priceAfn: 1500,
    yearlyAfn: 15000,
    employeeLimit: 20,
    deviceLimit: 20,
    features: ["attendance", "leave"],
    purchasable: true,
    blockedReason: null,
    ...over,
  };
}

function overview(over: Partial<BillingOverview["current"]> = {}): BillingOverview {
  return {
    plans: [
      plan(),
      plan({ id: "SILVER", priceAfn: 3500, yearlyAfn: 35000, employeeLimit: 75, deviceLimit: 75 }),
    ],
    current: {
      plan: "TRIAL",
      status: "ACTIVE",
      state: "ACTIVE",
      expiresAt: "2026-10-01",
      graceEndsAt: "2026-10-08",
      daysLeft: 14,
      enforced: true,
      features: ["attendance"],
      employeeLimit: 50,
      deviceLimit: 50,
      employeesInUse: 12,
      devicesInUse: 4,
      ...over,
    },
  };
}

function renderPage(path = "/billing") {
  // The page invalidates the licence query once a payment lands, so it needs a
  // real client even though every hook it reads is mocked.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocaleProvider>
          <BillingPage />
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  state.billing = overview();
  state.orders = [];
  state.returnedOrder = null;
  state.permissions = new Set(["billing:manage"]);
  state.checkout = vi.fn().mockResolvedValue({
    orderId: "o1",
    checkoutUrl: "https://pay.hesab.com/s/1",
    amountAfn: 1500,
  });
});

describe("plan & payment", () => {
  it("shows the plan the company is on and how much of it is used", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Plan & payment" })).toBeInTheDocument();
    expect(screen.getAllByText("Trial").length).toBeGreaterThan(0);
    expect(screen.getByText("12 of 50")).toBeInTheDocument();
    expect(screen.getByText("4 of 50")).toBeInTheDocument();
  });

  it("prices a year at ten months when the yearly term is chosen", async () => {
    renderPage();
    expect(screen.getByText("1,500")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(screen.getByText("15,000")).toBeInTheDocument();
  });

  it("sends the chosen plan and term to checkout", async () => {
    renderPage();
    await userEvent.click(screen.getAllByRole("button", { name: "Choose and pay" })[1]);
    expect(state.checkout).toHaveBeenCalledWith({ plan: "SILVER", term: "MONTHLY" });
  });

  it("refuses a plan smaller than the company already is", () => {
    // Selling a 20-person plan to a company of 40 would have to strand
    // sixteen of them, so the refusal belongs before the money moves.
    state.billing = {
      ...overview(),
      plans: [plan({ blockedReason: "EMPLOYEES" })],
    };
    renderPage();
    expect(
      screen.getByText("This company has more employees than this plan covers."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose and pay" })).toBeDisabled();
  });

  it("lets anyone see the plan but only an administrator buy one", () => {
    state.permissions = new Set();
    renderPage();
    expect(screen.getByText("Only a company administrator can buy or renew a plan.")).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Choose and pay" })) {
      expect(button).toBeDisabled();
    }
  });

  it("says what still works while a lapsed plan is in its grace window", () => {
    state.billing = overview({ state: "GRACE", daysLeft: 4 });
    renderPage();
    expect(screen.getByText(/Everything keeps working for 4 more days/)).toBeInTheDocument();
  });

  it("says the data is safe once the plan is over", () => {
    state.billing = overview({ state: "LAPSED", daysLeft: 0 });
    renderPage();
    expect(screen.getByText(/Your data and reports are safe/)).toBeInTheDocument();
  });

  it("reports the payment the customer has just come back from", () => {
    state.returnedOrder = {
      id: "o1",
      companyId: "c1",
      plan: "SILVER",
      term: "MONTHLY",
      months: 1,
      amountAfn: 3500,
      status: "PAID",
      createdAt: "2026-09-17T08:00:00.000Z",
      paidAt: "2026-09-17T08:01:00.000Z",
      transactionId: "tx1",
      checkoutUrl: null,
    };
    renderPage("/billing?order=o1&result=success");
    expect(screen.getByText(/the plan has been extended/)).toBeInTheDocument();
  });

  it("offers to finish a payment that was left in the air", () => {
    state.orders = [
      {
        id: "o2",
        companyId: "c1",
        plan: "BRONZE",
        term: "MONTHLY",
        months: 1,
        amountAfn: 1500,
        status: "PENDING",
        createdAt: "2026-09-17T08:00:00.000Z",
        paidAt: null,
        transactionId: null,
        checkoutUrl: "https://pay.hesab.com/s/2",
      },
    ];
    renderPage();
    expect(screen.getByRole("link", { name: "Finish payment" })).toHaveAttribute(
      "href",
      "https://pay.hesab.com/s/2",
    );
  });
});
