import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { isoTodayIn } from "../time";
import type {
  Account,
  AttendanceOverviewRow,
  WeeklyAttendance,
  CompanySettings,
  CalendarDay,
  CompanyDeletion,
  DayKind,
  Employee,
  EmployeeSalary,
  EmployeeSalaryWrite,
  EmployeeCreated,
  EmployeeWrite,
  Expense,
  ExpenseCategory,
  FinanceOverview,
  JournalEntry,
  JournalLine,
  Holiday,
  HolidayWrite,
  KioskAccount,
  License,
  LicensedDevice,
  KioskAccountCreated,
  Kpis,
  LeaveRequest,
  PayrollRun,
  SalaryComponent,
  SalaryComponentWrite,
  PayrollRunResult,
  Regularization,
  RosterRow,
  RunPayslipRow,
  Shift,
  ShiftWrite,
  TrendPoint,
  TrialBalance,
} from "./types";

export function useKpis(date?: string) {
  return useQuery({
    queryKey: ["kpis", date ?? "today"],
    queryFn: () => api.get<Kpis>("/analytics/kpis", { date }).then((e) => e.data),
  });
}

export function useAttendanceTrend(date?: string) {
  return useQuery({
    queryKey: ["attendance-trend", date ?? "today"],
    queryFn: () =>
      api
        .get<{ points: TrendPoint[] }>("/analytics/attendance-trend", { date })
        .then((e) => e.data.points),
  });
}

export function useAttendanceOverview(date?: string, timeZone = "Asia/Kabul") {
  // The live board must not go stale while a manager watches it: a check-in
  // made now should appear without a manual reload. Past days never change,
  // so they are fetched once instead of polled. "Today" is the company's day,
  // which is not the viewer's when they are in another country.
  return useQuery({ ...overviewQuery(date, timeZone), select: (d) => d.rows });
}

interface OverviewResponse {
  date: string;
  dayKind: DayKind;
  holidayName: string | null;
  rows: AttendanceOverviewRow[];
}

/**
 * Shared so the rows and the day kind come from one request. React Query keys
 * them the same, and each hook picks its slice with `select`.
 */
function overviewQuery(date: string | undefined, timeZone: string) {
  const isLive = date === undefined || date === isoTodayIn(timeZone);
  return {
    queryKey: ["attendance-overview", date ?? "today"] as const,
    queryFn: () =>
      api.get<OverviewResponse>("/attendance/overview", { date }).then((e) => e.data),
    refetchInterval: isLive ? (60_000 as const) : (false as const),
    refetchIntervalInBackground: false,
  };
}

/**
 * Whether the board's day is worked at all. Without this a Friday or a public
 * holiday renders as a full page of ABSENT with nothing explaining why.
 */
export function useAttendanceDay(date?: string, timeZone = "Asia/Kabul") {
  return useQuery({
    ...overviewQuery(date, timeZone),
    select: (d) => ({ date: d.date, kind: d.dayKind, holidayName: d.holidayName }),
  });
}

/** One week of attendance for the whole team (manager's weekly review). */
export function useWeeklyAttendance(date?: string, timeZone = "Asia/Kabul") {
  const isLive = date === undefined || date === isoTodayIn(timeZone);
  return useQuery({
    queryKey: ["attendance-weekly", date ?? "today"],
    queryFn: () =>
      api.get<WeeklyAttendance>("/attendance/weekly", { date }).then((e) => e.data),
    refetchInterval: isLive ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useEmployees(params: { cursor?: string; branchId?: string; status?: string }) {
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () =>
      api.get<Employee[]>("/employees", {
        cursor: params.cursor,
        branchId: params.branchId,
        status: params.status,
        limit: 50,
      }),
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmployeeWrite) =>
      api.post<EmployeeCreated>("/employees", body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: EmployeeWrite }) =>
      api.put<Employee>(`/employees/${args.id}`, args.body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useResetEmployeePassword() {
  return useMutation({
    mutationFn: (args: { id: string; password?: string }) =>
      api
        .post<{ tempPassword: string }>(
          `/employees/${args.id}/reset-password`,
          args.password ? { password: args.password } : {},
        )
        .then((e) => e.data),
  });
}

/** Admin: clear an employee's face enrollment so they can re-enroll. */
export function useResetEmployeeFace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (employeeId: string) =>
      api.del<{ faceEnrolled: boolean }>(`/employees/${employeeId}/face`).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function usePayrollRuns() {
  return useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: () => api.get<PayrollRun[]>("/payroll/runs").then((e) => e.data),
  });
}

export function useRunPayslips(runId: string | null) {
  return useQuery({
    enabled: runId !== null,
    queryKey: ["payroll", "run", runId],
    queryFn: () =>
      api
        .get<{ runId: string; payslips: RunPayslipRow[] }>(`/payroll/runs/${runId}/payslips`)
        .then((e) => e.data.payslips),
  });
}

export function useRunPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { periodYear: number; periodMonth: number }) =>
      api.post<PayrollRunResult>("/payroll/runs", args).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll"] }),
  });
}

// --------------------------------------------------------------------- finance

export function useFinanceOverview(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["finance", "overview"],
    queryFn: () => api.get<FinanceOverview>("/finance/overview").then((e) => e.data),
  });
}

export function useExpenses(status?: string) {
  return useQuery({
    queryKey: ["finance", "expenses", status ?? "all"],
    queryFn: () =>
      api.get<Expense[]>("/finance/expenses", { status }).then((e) => e.data),
  });
}

// --------------------------------------------------------------- salary setup

/**
 * An employee's salary. Payroll skips anyone without one, so this is what
 * stands between a company and its first payslip.
 */
export function useEmployeeSalary(employeeId: string | null) {
  return useQuery({
    queryKey: ["employee-salary", employeeId],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<EmployeeSalary | null>(`/payroll/employees/${employeeId}/salary`).then((e) => e.data),
  });
}

export function useSetEmployeeSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeSalaryWrite }) =>
      api.put<EmployeeSalary>(`/payroll/employees/${id}/salary`, body).then((e) => e.data),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["employee-salary", v.id] });
    },
  });
}

export function useSalaryComponents() {
  return useQuery({
    queryKey: ["salary-components"],
    queryFn: () => api.get<SalaryComponent[]>("/payroll/components").then((e) => e.data),
  });
}

export function useSaveSalaryComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: SalaryComponentWrite }) =>
      id
        ? api.put<SalaryComponent>(`/payroll/components/${id}`, body).then((e) => e.data)
        : api.post<SalaryComponent>("/payroll/components", body).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["salary-components"] });
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      category: ExpenseCategory;
      vendor: string;
      description: string;
      amount: number;
      date: string;
    }) => api.post<Expense>("/finance/expenses", body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

export function useDecideExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; action: "APPROVE" | "REJECT" | "PAY" }) =>
      api
        .post<Expense>(`/finance/expenses/${args.id}/decide`, { action: args.action })
        .then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

export function useAccounts(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["finance", "accounts"],
    queryFn: () => api.get<Account[]>("/finance/accounts").then((e) => e.data),
  });
}

export function useJournal(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["finance", "journal"],
    queryFn: () => api.get<JournalEntry[]>("/finance/journal").then((e) => e.data),
  });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; memo: string; lines: JournalLine[] }) =>
      api.post<{ id: string }>("/finance/journal", body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance"] }),
  });
}

export function useTrialBalance(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["finance", "trial-balance"],
    queryFn: () => api.get<TrialBalance>("/finance/trial-balance").then((e) => e.data),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["leave", "approvals"],
    queryFn: () =>
      api.get<LeaveRequest[]>("/leave/requests", { scope: "approvals" }).then((e) => e.data),
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decision: "APPROVE" | "REJECT"; note?: string | null }) =>
      api
        .post<LeaveRequest>(`/leave/requests/${args.id}/decide`, {
          decision: args.decision,
          note: args.note ?? null,
        })
        .then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leave", "approvals"] }),
  });
}

// -------------------------------------------------------------- shifts & roster

export function useShifts() {
  return useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get<Shift[]>("/shifts").then((e) => e.data),
  });
}

export function useSaveShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id?: string; body: ShiftWrite }) =>
      (args.id
        ? api.put<Shift>(`/shifts/${args.id}`, args.body)
        : api.post<Shift>("/shifts", args.body)
      ).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useRoster(date: string) {
  return useQuery({
    queryKey: ["roster", date],
    queryFn: () =>
      api
        .get<{ date: string; rows: RosterRow[] }>("/shifts/roster", { date })
        .then((e) => e.data.rows),
  });
}

export function useAssignRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      employeeIds: string[];
      shiftId: string;
      from: string;
      to?: string;
      branchId?: string | null;
    }) => api.post<{ created: number }>("/shifts/roster/assign", body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roster"] }),
  });
}

// ----------------------------------------------------------------------- kiosk

/** Current rotating kiosk token; refetched well before the 30s slot expires. */
export function useKioskToken(kioskId?: string) {
  return useQuery({
    queryKey: ["kiosk-token", kioskId ?? "default"],
    queryFn: () =>
      api
        .get<{ token: string; kioskId: string; companyName: string; rotateSeconds: number }>(
          "/kiosk/token",
          { kioskId },
        )
        .then((e) => e.data),
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useKioskAccounts(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["kiosk-accounts"],
    queryFn: () => api.get<KioskAccount[]>("/kiosk/accounts").then((e) => e.data),
  });
}

export function useCreateKioskAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; branchId?: string | null }) =>
      api.post<KioskAccountCreated>("/kiosk/accounts", body).then((e) => e.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk-accounts"] }),
  });
}

export function useResetKioskAccount() {
  return useMutation({
    mutationFn: (kioskId: string) =>
      api
        .post<{ kioskId: string; password: string }>(`/kiosk/accounts/${kioskId}/reset`, {})
        .then((e) => e.data),
  });
}

// -------------------------------------------------------------------- settings

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<CompanySettings>("/settings").then((e) => e.data),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CompanySettings>) =>
      api.put<CompanySettings>("/settings", patch).then((e) => e.data),
    onSuccess: (data) => {
      qc.setQueryData(["settings"], data);
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

export function usePendingRegularizations(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["regularizations", "approvals"],
    queryFn: () =>
      api
        .get<Regularization[]>("/attendance/regularizations", { scope: "approvals" })
        .then((e) => e.data),
  });
}

export function useDecideRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decision: "APPROVE" | "REJECT"; note?: string | null }) =>
      api
        .post<Regularization>(`/attendance/regularizations/${args.id}/decide`, {
          decision: args.decision,
          note: args.note ?? null,
        })
        .then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["regularizations", "approvals"] });
      void qc.invalidateQueries({ queryKey: ["attendance-overview"] });
    },
  });
}

// ------------------------------------------------------------ device licence

export function useLicense(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["license"],
    queryFn: () => api.get<License>("/devices/license").then((e) => e.data),
  });
}

export function useSaveLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: License) => api.put<License>("/devices/license", body).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["license"] });
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useDevices(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["devices"],
    queryFn: () => api.get<LicensedDevice[]>("/devices").then((e) => e.data),
  });
}

export function useSetDeviceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, action }: { deviceId: string; action: "revoke" | "restore" }) =>
      api.post<LicensedDevice>(`/devices/${deviceId}/${action}`, {}).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

// ------------------------------------------------------------ working calendar

export function useHolidays(from?: string, to?: string) {
  const qs = from && to ? `?from=${from}&to=${to}` : "";
  return useQuery({
    queryKey: ["holidays", from ?? null, to ?? null],
    queryFn: () => api.get<Holiday[]>(`/calendar/holidays${qs}`).then((e) => e.data),
  });
}

/** Every date in a range with whether it is worked, a weekend, or a holiday. */
export function useCalendarDays(from: string, to: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["calendar-days", from, to],
    queryFn: () =>
      api.get<CalendarDay[]>(`/calendar/days?from=${from}&to=${to}`).then((e) => e.data),
  });
}

export function useSaveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, ...body }: HolidayWrite & { date: string }) =>
      api.put<Holiday>(`/calendar/holidays/${date}`, body).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["holidays"] });
      void qc.invalidateQueries({ queryKey: ["calendar-days"] });
    },
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.del(`/calendar/holidays/${date}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["holidays"] });
      void qc.invalidateQueries({ queryKey: ["calendar-days"] });
    },
  });
}

/** Generates the fixed Solar Hijri holidays for a year. */
export function useSeedHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) =>
      api.post<{ year: number; added: number }>("/calendar/holidays/seed", { year }).then((e) => e.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["holidays"] });
      void qc.invalidateQueries({ queryKey: ["calendar-days"] });
    },
  });
}

// --------------------------------------------------------- closing the account

export function useCompanyDeletion(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["company-deletion"],
    queryFn: () => api.get<CompanyDeletion>("/company/deletion").then((e) => e.data),
  });
}

export function useRequestCompanyDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { confirmName: string; reason?: string | null }) =>
      api.post<CompanyDeletion>("/company/deletion", body).then((e) => e.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["company-deletion"] }),
  });
}

export function useCancelCompanyDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<CompanyDeletion>("/company/deletion"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["company-deletion"] }),
  });
}
