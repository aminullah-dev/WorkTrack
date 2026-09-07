import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { License, LicensedDevice } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";

const state = vi.hoisted(() => ({
  license: null as License | null,
  devices: [] as LicensedDevice[],
  permissions: new Set<string>(),
}));

vi.mock("../api/hooks", () => ({
  useLicense: () => ({
    data: state.license,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDevices: () => ({
    data: state.devices,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveLicense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetDeviceStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => state.permissions.has(p),
}));

const { DevicesPage } = await import("./DevicesPage");

function device(over: Partial<LicensedDevice> = {}): LicensedDevice {
  return {
    deviceId: "and-abc123",
    type: "MOBILE",
    label: null,
    platform: "ANDROID",
    model: "Pixel 10",
    appVersion: "1.0.0",
    employeeId: "e1",
    branchId: null,
    status: "ACTIVE",
    activatedAt: "2026-08-20T08:00:00.000Z",
    lastSeenAt: "2026-08-24T08:00:00.000Z",
    ...over,
  };
}

function renderPage() {
  return render(
    <LocaleProvider>
      <DevicesPage />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("worktrack.locale", "en");
  state.license = {
    plan: "STANDARD",
    deviceLimit: 3,
    status: "ACTIVE",
    expiresAt: null,
    enforceDevices: false,
  };
  state.devices = [];
  state.permissions = new Set(["devices:read", "devices:manage"]);
});

describe("devices & licence", () => {
  it("refuses the page to someone without device access", () => {
    state.permissions = new Set();
    renderPage();
    expect(screen.getByText("You do not have access to this section")).toBeInTheDocument();
  });

  it("shows how many seats the licence has left", () => {
    state.devices = [device(), device({ deviceId: "and-two" })];
    renderPage();
    expect(screen.getByText("2 of 3 devices")).toBeInTheDocument();
  });

  it("does not count a revoked device against the licence", () => {
    state.devices = [device(), device({ deviceId: "and-two", status: "REVOKED" })];
    renderPage();
    expect(screen.getByText("1 of 3 devices")).toBeInTheDocument();
  });

  it("offers to revoke an active device and to restore a revoked one", () => {
    state.devices = [device(), device({ deviceId: "and-two", status: "REVOKED" })];
    renderPage();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
    expect(screen.getByText("Restore")).toBeInTheDocument();
  });

  it("hides the revoke control from a read-only viewer", () => {
    state.permissions = new Set(["devices:read"]);
    state.devices = [device()];
    renderPage();
    expect(screen.queryByText("Revoke")).not.toBeInTheDocument();
  });

  it("warns that enforcement will lock out app builds already in the field", () => {
    renderPage();
    expect(
      screen.getByText(/builds already installed send no device id/i),
    ).toBeInTheDocument();
  });

  it("says so when every seat is taken", () => {
    state.license = { ...state.license!, deviceLimit: 2 };
    state.devices = [device(), device({ deviceId: "and-two" })];
    renderPage();
    expect(screen.getByText("2 of 2 devices")).toBeInTheDocument();
  });

  it("shows an empty state before any device has activated", () => {
    renderPage();
    expect(screen.getByText("No devices registered yet")).toBeInTheDocument();
  });
});
