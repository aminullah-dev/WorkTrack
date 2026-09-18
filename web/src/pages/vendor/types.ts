/** The vendor console's own types. Not shared with the tenant portal. */

export type PlanId = "TRIAL" | "BRONZE" | "SILVER" | "GOLD";

/** Every capability a plan can carry. Mirrors services/plans.ts. */
export const CAPABILITIES = [
  "attendance",
  "leave",
  "shifts",
  "announcements",
  "payroll",
  "finance",
  "documents",
  "kiosk",
  "projects",
  "pieceWork",
  "faceRecognition",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface License {
  plan: PlanId;
  deviceLimit: number;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt: string | null;
  /** When false, seats are counted but no device is ever refused. */
  enforceDevices: boolean;
  /** When false, the plan's capabilities and headcount are contractual only. */
  enforcePlan: boolean;
  /** A headcount negotiated for this company; null means the plan's own. */
  employeeLimit: number | null;
  /** Capabilities granted on top of the plan, for the customer who needs one. */
  extraFeatures: Capability[];
  /** Who wrote this licence last: the vendor, or the customer's own payment. */
  source: "VENDOR" | "SELF_SERVE";
}

/** One tier as the price list defines it. */
export interface PlanDef {
  id: PlanId;
  priceAfn: number;
  employeeLimit: number;
  deviceLimit: number;
  features: Capability[];
  purchasable: boolean;
}

/** A payment a customer started, whether or not it went through. */
export interface BillingOrder {
  id: string;
  companyId: string;
  plan: PlanId;
  term: "MONTHLY" | "YEARLY";
  months: number;
  amountAfn: number;
  status: "PENDING" | "PAID" | "FAILED";
  createdAt: string | null;
  paidAt: string | null;
  transactionId: string | null;
  checkoutUrl: string | null;
}

export interface CompanySummary {
  companyId: string;
  name: string;
  status: string;
  license: License;
  devicesInUse: number;
  employeeCount: number;
  daysUntilExpiry: number | null;
  deletion: { status: string; purgeAfter: string | null } | null;
}

export const STAGES = [
  "LEAD",
  "CONTACTED",
  "DEMO",
  "QUOTED",
  "WON",
  "LOST",
  "DORMANT",
] as const;
export type Stage = (typeof STAGES)[number];

export interface Account {
  id: string;
  name: string;
  stage: Stage;
  companyId?: string | null;
  city?: string | null;
  industry?: string | null;
  source?: string | null;
  employeesEstimate?: number | null;
  nextActionAt?: string | null;
  nextAction?: string | null;
  notes?: string | null;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  primary: boolean;
  notes?: string | null;
}

export const ACTIVITY_KINDS = ["CALL", "MEETING", "MESSAGE", "EMAIL", "VISIT", "NOTE"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface Activity {
  id: string;
  accountId: string;
  kind: ActivityKind;
  at: string;
  summary: string;
}

export interface Deal {
  id: string;
  accountId: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  plan: License["plan"];
  seats: number;
  amountAfn: number;
  term: "MONTHLY" | "YEARLY" | "ONE_OFF";
  quotedAt?: string | null;
  notes?: string | null;
}

export interface Invoice {
  id: string;
  accountId: string;
  number: string;
  status: "DRAFT" | "SENT" | "PAID" | "VOID";
  amountAfn: number;
  issuedAt: string;
  dueAt?: string | null;
  paidAt?: string | null;
  method?: "BANK" | "CASH" | "HAWALA" | "OTHER" | null;
  period?: string | null;
  notes?: string | null;
}

export interface Ticket {
  id: string;
  accountId: string;
  subject: string;
  status: "OPEN" | "WAITING" | "RESOLVED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  openedAt: string;
  resolvedAt?: string | null;
  detail?: string | null;
  resolution?: string | null;
}

export interface Dashboard {
  dueNow: Account[];
  dueSoon: Account[];
  unpaidInvoices: Invoice[];
  openTickets: Ticket[];
  pipeline: Record<string, number>;
  openPipelineAfn: number;
  outstandingAfn: number;
}

/** AFN with thousands separators; the console is LTR and English. */
export function afn(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n)) + " AFN";
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
