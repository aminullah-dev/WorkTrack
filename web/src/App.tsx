import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { LoginPage } from "./auth/LoginPage";
import { Layout } from "./ui/Layout";
import { LoadingState } from "./ui/components";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { AttendancePage } from "./pages/AttendancePage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { LeavePage } from "./pages/LeavePage";
import { PayrollPage } from "./pages/PayrollPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingState />;
  }
  if (status === "signedOut") {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="shifts" element={<ShiftsPage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
