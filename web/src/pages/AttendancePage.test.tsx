import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AttendanceOverviewRow } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const overviewRows = vi.hoisted(() => ({ current: [] as AttendanceOverviewRow[] }));

vi.mock("../api/hooks", () => ({
  useAttendanceOverview: () => ({
    data: overviewRows.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  // The corrections block hides itself when empty; keep it out of the way.
  usePendingRegularizations: () => ({ data: [], isLoading: false, isError: false }),
  useDecideRegularization: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => () => true,
  // The board resolves dates in the company's zone, not the viewer's.
  useAuth: () => ({ me: { timezone: "Asia/Kabul" } }),
}));

// Imported after the mocks so the page picks them up.
const { AttendancePage } = await import("./AttendancePage");

function row(over: Partial<AttendanceOverviewRow> = {}): AttendanceOverviewRow {
  return {
    employeeId: "e1",
    employeeName: "Ahmad Karimi",
    branchId: null,
    status: "PRESENT",
    firstInAt: "2026-07-24T04:00:00.000Z",
    lastOutAt: null,
    workedMinutes: 300,
    lateMinutes: 0,
    hasCheckInSelfie: false,
    checkInFaceVerified: false,
    needsReview: false,
    employeeStatus: "ACTIVE",
    rejectedCount: 0,
    rejectedReason: null,
    rejectedAt: null,
    ...over,
  };
}

function renderPage() {
  return render(
    <LocaleProvider>
      <AttendancePage />
    </LocaleProvider>,
    { wrapper: ({ children }: { children: ReactNode }) => <>{children}</> },
  );
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  overviewRows.current = [];
});

describe("attendance overview — face verification signals", () => {
  it("flags a row whose check-in was not face-verified", () => {
    overviewRows.current = [row({ needsReview: true })];
    renderPage();
    // Once in the table row, once in the summary tile.
    expect(screen.getAllByText("Needs review").length).toBeGreaterThan(0);
    expect(screen.getByTitle("Recorded without face verification")).toBeInTheDocument();
  });

  it("leaves a verified row unflagged", () => {
    overviewRows.current = [row({ checkInFaceVerified: true })];
    renderPage();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
    expect(screen.getByTitle("Face verified")).toBeInTheDocument();
  });

  it("counts every flagged row in the summary tile", () => {
    overviewRows.current = [
      row({ employeeId: "a", needsReview: true }),
      row({ employeeId: "b", needsReview: true }),
      row({ employeeId: "c" }),
    ];
    renderPage();
    const tile = screen.getByText("Needs review", { selector: ".label" }).parentElement;
    expect(tile).toHaveTextContent("2");
  });

  it("hides the summary tile when nothing needs review", () => {
    overviewRows.current = [row(), row({ employeeId: "b" })];
    renderPage();
    expect(screen.queryByText("Needs review", { selector: ".label" })).not.toBeInTheDocument();
  });

  it("localizes the flag into Dari", () => {
    localStorage.setItem("worktrack.locale", "fa");
    overviewRows.current = [row({ needsReview: true })];
    renderPage();
    expect(screen.getAllByText("نیاز به بررسی").length).toBeGreaterThan(0);
  });
});

describe("attendance overview — refused punches", () => {
  it("names the rule that refused the punch instead of staying silent", () => {
    overviewRows.current = [
      row({
        status: "PENDING",
        firstInAt: null,
        workedMinutes: 0,
        rejectedCount: 1,
        rejectedReason: "GEOFENCE_VIOLATION",
        rejectedAt: "2026-07-24T04:03:00.000Z",
      }),
    ];
    renderPage();
    expect(screen.getByText("Outside the work area")).toBeInTheDocument();
  });

  it("falls back to a readable reason for an unknown code", () => {
    overviewRows.current = [row({ rejectedCount: 1, rejectedReason: "SOMETHING_NEW" })];
    renderPage();
    expect(screen.getByText("Unknown reason")).toBeInTheDocument();
  });

  it("shows how many punches were refused when there is more than one", () => {
    overviewRows.current = [
      row({ rejectedCount: 3, rejectedReason: "TIME_SKEW" }),
    ];
    renderPage();
    expect(screen.getByText(/Device clock is wrong\s*\(3\)/)).toBeInTheDocument();
  });

  it("counts a refused-punch row in the attention tile", () => {
    overviewRows.current = [row({ rejectedCount: 1, rejectedReason: "GEOFENCE_VIOLATION" })];
    renderPage();
    const tile = screen.getByText("Needs review", { selector: ".label" }).parentElement;
    expect(tile).toHaveTextContent("1");
  });
});

describe("attendance overview — non-active employees", () => {
  it("marks an employee who is no longer active but still has a day", () => {
    overviewRows.current = [row({ employeeStatus: "SUSPENDED" })];
    renderPage();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Ahmad Karimi")).toBeInTheDocument();
  });

  it("does not mark active employees", () => {
    overviewRows.current = [row()];
    renderPage();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });
});
