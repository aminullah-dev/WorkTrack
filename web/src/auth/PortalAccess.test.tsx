import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { ThemeProvider } from "../ui/ThemeProvider";

/**
 * Who gets into the portal, and what they land on.
 *
 * The door was opened to EMPLOYEE so somebody whose phone cannot run the app
 * can still see their own work. Two things have to hold, and neither is
 * visible from the markup:
 *
 *   - an employee lands on their own work, not on the company dashboard, whose
 *     every request needs attendance:read and would fail;
 *   - opening the door does not put anything behind it within reach.
 */

// Layout renders the theme toggle, and ThemeProvider asks the platform whether
// the system is dark. jsdom has no matchMedia.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const roles = vi.hoisted(() => ({ current: ["EMPLOYEE"] as string[] }));

// The header now carries the notification bell, which queries. This test is
// about who gets which nav items, so the bell is kept inert rather than given
// a QueryClient it would only use to fetch nothing.
vi.mock("../api/hooks", () => ({
  useNotifications: () => ({ data: { items: [], unread: 0 } }),
  useMarkNotificationRead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const PERMS: Record<string, string[]> = {
  "attendance:read": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "AUDITOR", "PAYROLL_ADMIN"],
  "employees:read": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "AUDITOR", "PAYROLL_ADMIN"],
  "payroll:read": ["HR_ADMIN", "PAYROLL_ADMIN", "FINANCE_ADMIN", "AUDITOR"],
  "leave:approve": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD"],
  "rosters:read": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD"],
  "finance:read": ["FINANCE_ADMIN", "AUDITOR"],
  "devices:read": ["HR_ADMIN", "BRANCH_MANAGER"],
  "kiosk:issue": ["HR_ADMIN", "BRANCH_MANAGER"],
  "settings:write": [],
  "work:read": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "AUDITOR"],
  "self:tasks": ["HR_ADMIN", "BRANCH_MANAGER", "TEAM_LEAD", "EMPLOYEE"],
};

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({
    me: { displayName: "Ali Rahimi", companyName: "Kabul Construction", companyId: "c1" },
    signOut: vi.fn(),
  }),
  useHasPermission: () => (p: string) =>
    roles.current.includes("COMPANY_ADMIN") || (PERMS[p] ?? []).some((r) => roles.current.includes(r)),
  useFeatures: () => ({
    shifts: true, leave: true, payroll: true, regularization: true,
    announcements: true, geofencing: true, qrKiosk: true, faceRecognition: false, finance: true,
  }),
}));

const { Layout } = await import("../ui/Layout");

function renderNav(): void {
  render(
    <MemoryRouter initialEntries={["/work"]}>
      <LocaleProvider>
        <ThemeProvider>{(<Layout />) as ReactNode}</ThemeProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

/** Every nav destination the portal has, by the label it shows. */
const MANAGER_ONLY = [
  "کارمندان",
  "حاضری",
  "شیفت‌ها",
  "رخصتی‌ها",
  "معاش",
  "مالی",
  "کیوسک",
  "دستگاه‌ها و لایسنس",
  "تنظیمات",
  "داشبورد",
];

beforeEach(() => {
  roles.current = ["EMPLOYEE"];
});

describe("what an employee is offered in the portal", () => {
  it("shows them their work and nothing else", () => {
    renderNav();

    expect(screen.getByRole("link", { name: /کار و پروژه/ })).toBeInTheDocument();
    for (const label of MANAGER_ONLY) {
      expect(screen.queryByRole("link", { name: new RegExp(label) })).not.toBeInTheDocument();
    }
  });

  it("hides the dashboard link rather than offering one that bounces", () => {
    // "/" redirects an employee to /work, so a visible Dashboard item would be
    // a link that silently goes somewhere else.
    renderNav();
    expect(screen.queryByRole("link", { name: /داشبورد/ })).not.toBeInTheDocument();
  });
});

describe("what a manager still sees", () => {
  it("keeps the full menu for an HR admin", () => {
    roles.current = ["HR_ADMIN"];
    renderNav();

    for (const label of ["داشبورد", "کارمندان", "حاضری", "کار و پروژه"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("still keeps finance away from an HR admin", () => {
    // Opening the door to employees must not have loosened anything else.
    roles.current = ["HR_ADMIN"];
    renderNav();
    expect(screen.queryByRole("link", { name: /مالی/ })).not.toBeInTheDocument();
  });
});
