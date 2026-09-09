import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, useHasPermission } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { Layout } from "./ui/Layout";
import { LoadingState } from "./ui/components";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { AttendancePage } from "./pages/AttendancePage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { WorkPage } from "./pages/WorkPage";
import { LeavePage } from "./pages/LeavePage";
import { PayrollPage } from "./pages/PayrollPage";
import { FinancePage } from "./pages/FinancePage";
import { SettingsPage } from "./pages/SettingsPage";
import { KioskPage } from "./pages/KioskPage";
import { DevicesPage } from "./pages/DevicesPage";
import { VendorConsole } from "./pages/VendorConsole";

export function App() {
  const { status } = useAuth();
  const can = useHasPermission();

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "signedOut") {
    return <LoginPage />;
  }
  // Linumic staff get their own console, not the customer portal — they have
  // no company, and every tenant route would refuse their token anyway.
  if (status === "vendor") {
    return <VendorConsole />;
  }
  // A dedicated kiosk device is locked to the full-screen check-in display.
  if (status === "kiosk") {
    return <KioskPage />;
  }

  return (
    <Routes>
      {/* Kiosk mode runs full-screen, outside the portal chrome. */}
      <Route path="/kiosk" element={<KioskPage />} />
      <Route element={<Layout />}>
        {/*
          The dashboard is the company's numbers — headcount, who is present,
          the attendance trend — and every one of them needs attendance:read.
          An employee landing there would meet a page of failed requests, so
          they land on their own work instead, which is the only thing the
          portal has for them.
        */}
        <Route
          index
          element={can("attendance:read") ? <DashboardPage /> : <Navigate to="/work" replace />}
        />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="work" element={<WorkPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
