import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";
import { ThemeToggle } from "./ThemeProvider";

export function Layout() {
  const { me, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const can = useHasPermission();

  const navItems = [
    { to: "/", icon: <IconGrid />, label: t("nav_dashboard"), show: true, end: true },
    { to: "/employees", icon: <IconPeople />, label: t("nav_employees"), show: can("employees:read") },
    { to: "/attendance", icon: <IconClock />, label: t("nav_attendance"), show: can("attendance:read") },
    { to: "/leave", icon: <IconPlane />, label: t("nav_leave"), show: can("leave:approve") },
    { to: "/payroll", icon: <IconWallet />, label: t("nav_payroll"), show: can("payroll:read") },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <span>
            WorkTrack
            <small>{t("brand_tagline")}</small>
          </span>
        </div>
        <div className="nav-label">{t("nav_menu")}</div>
        {navItems
          .filter((item) => item.show)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        <div className="sidebar-spacer" />
        {me && (
          <div className="user-card">
            <span className="avatar">{initials(me.displayName)}</span>
            <span className="meta">
              <b>{me.displayName}</b>
              <span>{me.companyName}</span>
            </span>
          </div>
        )}
        <button className="nav-item" onClick={() => void signOut()}>
          <span className="icon">
            <IconLogout />
          </span>
          {t("nav_logout")}
        </button>
      </aside>

      <main className="main">
        <div className="appbar">
          <div className="lang-switch">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                className={l.code === locale ? "active" : ""}
                onClick={() => setLocale(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="topbar-right">
            <span className="pill">
              <IconBuilding />
              {me?.companyName}
            </span>
            <ThemeToggle />
          </div>
        </div>
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? "" : "";
  return (first + second).toUpperCase();
}

/* ---- Inline icons: stroke inherits currentColor, so they tint with the item ---- */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IconGrid = () => (
  <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
);
const IconPeople = () => (
  <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M17 14.4A5.5 5.5 0 0 1 20.5 20" /></Svg>
);
const IconClock = () => (
  <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
);
const IconPlane = () => (
  <Svg><path d="M10.5 13.5 3 12l18-7-7 18-3.5-7.5L10.5 13.5Z" /></Svg>
);
const IconWallet = () => (
  <Svg><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 9h18" /><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></Svg>
);
const IconLogout = () => (
  <Svg><path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8" /><path d="M17 15l4-3-4-3" /><path d="M21 12H10" /></Svg>
);
const IconBuilding = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
  </svg>
);
