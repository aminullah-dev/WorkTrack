import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useHasPermission } from "../auth/AuthProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { LOCALES } from "../i18n/strings";

export function Layout() {
  const { me, signOut } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const can = useHasPermission();

  const navItems = [
    { to: "/", icon: "▤", label: t("nav_dashboard"), show: true, end: true },
    { to: "/employees", icon: "◍", label: t("nav_employees"), show: can("employees:read") },
    { to: "/attendance", icon: "◷", label: t("nav_attendance"), show: can("attendance:read") },
    { to: "/leave", icon: "✈", label: t("nav_leave"), show: can("leave:approve") },
    { to: "/payroll", icon: "₼", label: t("nav_payroll"), show: can("payroll:read") },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          WorkTrack
          <small>{t("nav_dashboard")}</small>
        </div>
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
        <button className="nav-item" onClick={() => void signOut()}>
          <span className="icon">⏻</span>
          {t("nav_logout")}
        </button>
      </aside>

      <main className="main">
        <div className="topbar">
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
            <span className="user-chip">
              {me?.displayName} · {me?.companyName}
            </span>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
