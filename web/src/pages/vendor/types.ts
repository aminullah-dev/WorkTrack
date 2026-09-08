/** The vendor console's own types. Not shared with the tenant portal. */

export interface License {
  plan: "FREE" | "STANDARD" | "ENTERPRISE";
  deviceLimit: number;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  expiresAt: string | null;
  enforceDevices: boolean;
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
