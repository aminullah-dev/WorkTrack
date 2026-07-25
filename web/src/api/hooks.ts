import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AttendanceOverviewRow,
  CompanySettings,
  Employee,
  EmployeeCreated,
  EmployeeWrite,
  KioskAccount,
  KioskAccountCreated,
  Kpis,
  LeaveRequest,
  PayrollRun,
  PayrollRunResult,
  Regularization,
  RosterRow,
  RunPayslipRow,
  Shift,
  ShiftWrite,
  TrendPoint,
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

/** Local calendar date (YYYY-MM-DD), matching the page's date picker. */
function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function useAttendanceOverview(date?: string) {
  // The live board must not go stale while a manager watches it: a check-in
  // made now should appear without a manual reload. Past days never change,
  // so they are fetched once instead of polled.
  const isLive = date === undefined || date === isoToday();
  return useQuery({
    queryKey: ["attendance-overview", date ?? "today"],
    queryFn: () =>
      api
        .get<{ date: string; rows: AttendanceOverviewRow[] }>("/attendance/overview", { date })
        .then((e) => e.data.rows),
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
