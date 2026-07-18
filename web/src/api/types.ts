// Wire types mirroring the backend REST API v1 responses.

export interface Envelope<T> {
  data: T;
  meta?: { cursor?: string | null; hasMore?: boolean };
}

export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  fieldErrors?: Record<string, string>;
}

export interface Me {
  uid: string;
  companyId: string;
  companyName: string;
  employeeId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roles: string[];
  branchIds: string[];
}

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
export type EmployeeStatus = "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "EXITED";

export interface Employee {
  id: string;
  companyId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  employmentType: EmploymentType;
  joinDate: string;
  status: EmployeeStatus;
  updatedAt: string;
}

export interface EmployeeWrite {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  employmentType: EmploymentType;
  joinDate: string;
  status: EmployeeStatus;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  timezone: string;
  updatedAt: string;
}

export interface Kpis {
  date: string;
  activeEmployees: number;
  present: number;
  halfDay: number;
  late: number;
  onLeave: number;
  absent: number;
  pendingLeaveRequests: number;
  attendanceRate: number;
}

export interface TrendPoint {
  date: string;
  present: number;
}

export interface AttendanceOverviewRow {
  employeeId: string;
  employeeName: string;
  branchId: string | null;
  status: string;
  firstInAt: string | null;
  lastOutAt: string | null;
  workedMinutes: number;
  lateMinutes: number;
}

export interface PayrollRun {
  id: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  currency: string;
  payslipCount: number;
  totalGross: number;
  totalNet: number;
  lockedAt: string | null;
  createdAt: string | null;
}

export interface PayrollRunResult {
  runId: string;
  periodYear: number;
  periodMonth: number;
  currency: string;
  payslipCount: number;
  totalNet: number;
  totalGross: number;
}

export interface RunPayslipRow {
  id: string;
  employeeId: string;
  employeeName: string;
  currency: string;
  gross: number;
  totalDeductions: number;
  net: number;
  workedDays: number;
  lopDays: number;
  status: string;
}

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string | null;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  days: number;
  reason: string;
  status: string;
  currentApproverId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}
