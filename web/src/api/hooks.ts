import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AttendanceOverviewRow,
  CompanySettings,
  Employee,
  EmployeeCreated,
  EmployeeWrite,
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

export function useAttendanceOverview(date?: string) {
  return useQuery({
    queryKey: ["attendance-overview", date ?? "today"],
    queryFn: () =>
      api
        .get<{ date: string; rows: AttendanceOverviewRow[] }>("/attendance/overview", { date })
        .then((e) => e.data.rows),
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
