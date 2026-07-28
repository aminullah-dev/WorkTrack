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

export interface CompanyFeatures {
  shifts: boolean;
  leave: boolean;
  payroll: boolean;
  regularization: boolean;
  announcements: boolean;
  geofencing: boolean;
  qrKiosk: boolean;
  faceRecognition: boolean;
}

export interface CompanyPolicies {
  standardDailyMinutes: number;
  /** ISO weekday numbers (Mon=1 … Sun=7). Afghanistan defaults to Friday (5). */
  weekendDays: number[];
  lateGraceMinutes: number;
  overtimeEnabled: boolean;
}

export interface CompanyProfile {
  currency: string;
  timezone: string;
}

export interface CompanySettings {
  features: CompanyFeatures;
  policies: CompanyPolicies;
  profile: CompanyProfile;
}

export interface Me {
  uid: string;
  companyId: string;
  companyName: string;
  currency: string;
  employeeId: string;
  /** IANA zone the company operates in; attendance dates are resolved in it. */
  timezone: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roles: string[];
  branchIds: string[];
  features: CompanyFeatures;
}

export interface Shift {
  id: string;
  companyId: string;
  name: string;
  code: string;
  startTime: string; // "HH:mm"
  endTime: string;
  breakMinutes: number;
  graceInMinutes: number;
  graceOutMinutes: number;
  isNightShift: boolean;
  active: boolean;
  updatedAt: string;
}

export interface ShiftWrite {
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceInMinutes: number;
  graceOutMinutes: number;
  active: boolean;
}

export interface KioskAccount {
  kioskId: string;
  label: string;
  email: string | null;
  branchId: string | null;
  active: boolean;
  createdAt: string | null;
}

/** POST /kiosk/accounts echoes the one-time device credentials. */
export interface KioskAccountCreated {
  kioskId: string;
  label: string;
  email: string;
  password: string;
  branchId: string | null;
}

export interface RosterRow {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId: string;
  shiftName: string;
  branchId: string | null;
  date: string;
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

export type AssignableRole =
  | "EMPLOYEE"
  | "TEAM_LEAD"
  | "BRANCH_MANAGER"
  | "HR_ADMIN"
  | "PAYROLL_ADMIN"
  | "AUDITOR";

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
  role?: AssignableRole;
  createLogin?: boolean;
  initialPassword?: string;
}

/** POST /employees echoes the created employee plus the temp login password. */
export interface EmployeeCreated extends Employee {
  tempPassword: string | null;
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
  /** Check-in selfie (base64 data URL) when photo-verified attendance is on. */
  checkInSelfie: string | null;
  /** The check-in punch was confirmed against the employee's enrolled face. */
  checkInFaceVerified: boolean;
  /** Face recognition is on, but a punch this day was not face-verified. */
  needsReview: boolean;
  /** Employee record status; non-ACTIVE people appear only if they have a day. */
  employeeStatus: string;
  /** Punches the server refused (geofence, clock skew, …) and did not count. */
  rejectedCount: number;
  /** Machine-readable reason of the first refusal, e.g. GEOFENCE_VIOLATION. */
  rejectedReason: string | null;
  rejectedAt: string | null;
}

/** One employee's week on the manager's weekly report. */
export interface WeeklyAttendanceRow {
  employeeId: string;
  employeeName: string;
  employeeStatus: string;
  branchId: string | null;
  days: {
    date: string;
    status: string;
    workedMinutes: number;
    lateMinutes: number;
    needsReview: boolean;
    rejectedCount: number;
  }[];
  totalWorkedMinutes: number;
  presentDays: number;
  lateDays: number;
  needsReviewDays: number;
}

export interface WeeklyAttendance {
  from: string;
  to: string;
  /** The seven dates of the week, Saturday first. */
  dates: string[];
  rows: WeeklyAttendanceRow[];
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

/** Employee-filed request to correct a day's check-in/check-out times. */
export interface Regularization {
  id: string;
  companyId: string;
  employeeId: string;
  employeeName: string | null;
  date: string;
  requestedInAt: string | null;
  requestedOutAt: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentApproverId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}
