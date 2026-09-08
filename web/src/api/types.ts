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
  finance: boolean;
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
  /** IANA zone the company operates in; attendance dates are resolved in it. */
  timezone: string;
  employeeId: string;
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
  faceEnrolled: boolean;
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
  /**
   * Whether a check-in photo exists. The image itself is fetched on demand —
   * inlining it here made a 500-row board polled every minute unusable.
   */
  hasCheckInSelfie: boolean;
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

/** An employee's basic pay. Null until someone configures it. */
export interface EmployeeSalary {
  employeeId: string;
  basicAmount: number;
  currency: string;
  effectiveFrom: string | null;
  revisionReason: string | null;
  updatedAt: string | null;
}

export interface EmployeeSalaryWrite {
  basicAmount: number;
  effectiveFrom: string;
  revisionReason?: string | null;
}

/** An allowance, deduction or employer cost applied to every payslip. */
export interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: "EARNING" | "DEDUCTION" | "EMPLOYER_COST";
  calc: "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS";
  value: number;
  taxable: boolean;
  /** ALL applies to everyone unless withheld; INDIVIDUAL only where assigned. */
  scope: "ALL" | "INDIVIDUAL";
  active: boolean;
}

export type SalaryComponentWrite = Omit<SalaryComponent, "id">;

/** An issue this company raised with Linumic. A receipt, not the vendor's file. */
export interface SupportTicket {
  id: string;
  subject: string;
  status: "OPEN" | "WAITING" | "RESOLVED";
  openedAt: string | null;
  resolvedAt: string | null;
}

/** One employee's exception against a component: a different amount, or none. */
export interface ComponentAssignment {
  employeeId: string;
  componentId: string;
  /** Null means "the component's own amount". */
  value: number | null;
  /** False withholds an otherwise company-wide component from this employee. */
  active: boolean;
}

/** A company's device licence: how many devices may run the app at once. */
export interface License {
  plan: "FREE" | "STANDARD" | "ENTERPRISE";
  deviceLimit: number;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt: string | null;
  /** When false, devices are tracked but never refused — the rollout switch. */
  enforceDevices: boolean;
}

/** One phone or kiosk occupying a licence seat. */
export interface LicensedDevice {
  deviceId: string;
  type: string;
  label: string | null;
  platform: string | null;
  model: string | null;
  appVersion: string | null;
  employeeId: string | null;
  branchId: string | null;
  status: "ACTIVE" | "REVOKED";
  activatedAt: string | null;
  lastSeenAt: string | null;
}

/** A day the company is closed. Keyed by the Gregorian date it is observed. */
export interface Holiday {
  date: string;
  name: string;
  nameEn: string;
  paid: boolean;
  /** SOLAR_RECURRING entries are generated per year; MANUAL ones were entered. */
  source: "SOLAR_RECURRING" | "MANUAL";
}

export interface HolidayWrite {
  name: string;
  nameEn?: string | null;
  paid: boolean;
}

export type DayKind = "WORKING" | "WEEKEND" | "HOLIDAY";

/** One date and what kind of day it is, for the attendance board. */
export interface CalendarDay {
  date: string;
  kind: DayKind;
  holidayName: string | null;
  holidayNameEn: string | null;
  paid: boolean | null;
}

/** Where the company account stands: running, or scheduled to be closed. */
export interface CompanyDeletion {
  status: "NONE" | "SCHEDULED";
  requestedAt: string | null;
  requestedBy: string | null;
  /** Date from which the data is destroyed, YYYY-MM-DD. */
  purgeAfter: string | null;
  reason: string | null;
  graceDays: number;
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
  totalTax: number;
  totalEmployerCost: number;
  /** Absent on runs made before this field existed; those were all whole months. */
  periodComplete?: boolean;
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
  totalTax: number;
  totalEmployerCost: number;
  periodComplete?: boolean;
  /** Active employees left out of the run because they have no salary on file. */
  skippedNoSalary?: Array<{ employeeId: string; name: string }>;
  /** People marked as having left who nonetheless worked in this period. */
  skippedExited?: Array<{ employeeId: string; name: string }>;
}

export interface RunPayslipRow {
  id: string;
  employeeId: string;
  employeeName: string;
  currency: string;
  gross: number;
  totalDeductions: number;
  net: number;
  incomeTax: number;
  employerCost: number;
  costToCompany: number;
  workedDays: number;
  lopDays: number;
  status: string;
}

// ------------------------------------------------------------------- finance

export type ExpenseStatus = "DRAFT" | "APPROVED" | "REJECTED" | "PAID";
export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "supplies"
  | "travel"
  | "services"
  | "other";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  status: ExpenseStatus;
  accountCode: string;
  createdBy: string;
  createdAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  active: boolean;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  reference: string | null;
  source: "MANUAL" | "EXPENSE" | "PAYROLL";
  lines: JournalLine[];
  totalDebit: number;
  createdBy: string;
  createdAt: string | null;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  byType: Record<AccountType, number>;
  netProfit: number;
}

export interface FinanceOverview {
  currency: string;
  ledger: {
    incomeTotal: number;
    expenseTotal: number;
    assetTotal: number;
    liabilityTotal: number;
    netProfit: number;
  };
  expenses: { count: number; pendingCount: number; approvedTotal: number };
  payroll: { runCount: number; netTotal: number };
  trend: { month: string; income: number; expense: number; net: number }[];
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

// --------------------------------------------------------------- work

/** A thing the company is building: a contract, a site, a phase. */
export interface Project {
  id: string;
  companyId: string;
  name: string;
  code: string;
  description: string | null;
  branchId: string | null;
  managerId: string | null;
  status: "PLANNED" | "ACTIVE" | "PAUSED" | "DONE";
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
}

export type ProjectWrite = Omit<Project, "id" | "companyId" | "updatedAt">;

/**
 * A named crew. Not a department: the plastering team is drawn from three
 * departments and looks different next month.
 */
export interface WorkTeam {
  id: string;
  companyId: string;
  name: string;
  projectId: string | null;
  leadId: string | null;
  memberIds: string[];
  active: boolean;
  updatedAt: string;
}

export type WorkTeamWrite = Omit<WorkTeam, "id" | "companyId" | "updatedAt">;

export type TaskStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "BLOCKED";

/**
 * One piece of work, on a date range, for one or more people.
 *
 * `assigneeIds` is always people — assigning a crew expands to its members on
 * the server, so `teamId` records where the assignment came from rather than
 * who is responsible now.
 */
export interface WorkTask {
  id: string;
  companyId: string;
  projectId: string;
  projectName: string;
  title: string;
  detail: string | null;
  location: string | null;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  priority: "LOW" | "NORMAL" | "HIGH";
  teamId: string | null;
  teamName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  statusNote: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface TaskWrite {
  projectId: string;
  title: string;
  detail?: string | null;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  teamId?: string | null;
  assigneeIds: string[];
}

/** One day of one person's work, with why it is empty when it is. */
export interface WorkDay {
  date: string;
  kind: DayKind;
  tasks: WorkTask[];
}

export interface MyWork {
  today: WorkDay;
  next: WorkDay | null;
}

export interface DayBoardRow {
  employeeId: string;
  name: string;
  tasks: WorkTask[];
}

export interface DayBoard {
  date: string;
  rows: DayBoardRow[];
}
