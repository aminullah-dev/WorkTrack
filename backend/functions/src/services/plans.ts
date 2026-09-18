import { z } from "zod";
import { db } from "../lib/firestore";

/**
 * What a company is entitled to, by plan.
 *
 * Nothing in the product asks which plan a company is on. It asks whether a
 * capability is available and whether a count is still under its cap. Tier
 * names are marketing: they get renamed, translated, and bundled differently
 * for one large customer. Feature keys do not, and a single customer who needs
 * one extra capability on a smaller plan is a licence change, not a new tier.
 *
 * Prices and caps live in code as the default and may be overridden per
 * deployment in `platformConfig/plans`, so raising a price does not need a
 * deploy — the Afghani moves, and a price list that can only change with a
 * release is a price list that goes stale.
 */

/** Capability keys. The gate asks for these; it never asks for a tier. */
export const FEATURE_KEYS = [
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

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PlanId = "TRIAL" | "BRONZE" | "SILVER" | "GOLD";

export const PLAN_IDS: readonly PlanId[] = ["TRIAL", "BRONZE", "SILVER", "GOLD"];

export interface PlanDef {
  id: PlanId;
  /** Monthly price in Afghani. 0 for the trial, which is never sold. */
  priceAfn: number;
  /** Active employees a company may hold. */
  employeeLimit: number;
  /** Device seats, one per phone or kiosk tablet. */
  deviceLimit: number;
  features: FeatureKey[];
  /** False for tiers a customer cannot buy from the portal. */
  purchasable: boolean;
}

/** Everything the smallest paid tier includes; every larger tier adds to it. */
const CORE: FeatureKey[] = ["attendance", "leave", "shifts", "announcements"];
const SILVER_ADDS: FeatureKey[] = ["payroll", "finance", "documents", "kiosk"];
const GOLD_ADDS: FeatureKey[] = ["projects", "pieceWork", "faceRecognition"];

const GOLD_FEATURES: FeatureKey[] = [...CORE, ...SILVER_ADDS, ...GOLD_ADDS];

/**
 * The trial is the whole product with a deadline, not a crippled build. A
 * company that never sees payroll during its trial cannot decide whether
 * payroll is worth paying for.
 */
export const DEFAULT_PLANS: Record<PlanId, PlanDef> = {
  TRIAL: {
    id: "TRIAL",
    priceAfn: 0,
    employeeLimit: 50,
    deviceLimit: 50,
    features: GOLD_FEATURES,
    purchasable: false,
  },
  BRONZE: {
    id: "BRONZE",
    priceAfn: 1_500,
    employeeLimit: 20,
    deviceLimit: 20,
    features: CORE,
    purchasable: true,
  },
  SILVER: {
    id: "SILVER",
    priceAfn: 3_500,
    employeeLimit: 75,
    deviceLimit: 75,
    features: [...CORE, ...SILVER_ADDS],
    purchasable: true,
  },
  GOLD: {
    id: "GOLD",
    priceAfn: 7_000,
    employeeLimit: 500,
    deviceLimit: 500,
    features: GOLD_FEATURES,
    purchasable: true,
  },
};

/** How long the trial a new company is provisioned with lasts. */
export const TRIAL_DAYS = 14;

/**
 * Days after expiry during which the product keeps working untouched.
 *
 * A company whose payment is three days late is a customer, not a defaulter,
 * and locking a factory out of its own attendance the morning a licence lapses
 * loses the customer rather than collecting from them.
 */
export const GRACE_DAYS = 7;

/** Billing terms a company may buy, and what each multiplies the monthly price by. */
export const TERMS = {
  MONTHLY: { months: 1, multiplier: 1 },
  /** Twelve months for the price of ten — the discount is the reason to prepay. */
  YEARLY: { months: 12, multiplier: 10 },
} as const;

export type TermId = keyof typeof TERMS;

export const planIdSchema = z.enum(["TRIAL", "BRONZE", "SILVER", "GOLD"]);
export const termIdSchema = z.enum(["MONTHLY", "YEARLY"]);

/**
 * Tier names as they were before the plans were sold: a licence issued by hand
 * still says STANDARD, and reading it must not throw.
 */
const LEGACY_PLANS: Record<string, PlanId> = {
  FREE: "BRONZE",
  STANDARD: "SILVER",
  ENTERPRISE: "GOLD",
};

export function normalizePlan(value: unknown): PlanId {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if ((PLAN_IDS as readonly string[]).includes(upper)) return upper as PlanId;
    const legacy = LEGACY_PLANS[upper];
    if (legacy) return legacy;
  }
  return "BRONZE";
}

/** What a term costs in whole Afghani, from the catalogue price. */
export function priceOf(plan: PlanDef, term: TermId): number {
  return plan.priceAfn * TERMS[term].multiplier;
}

const CATALOG_DOC = "platformConfig/plans";
const CATALOG_TTL_MS = 60_000;

let cached: { at: number; catalog: Record<PlanId, PlanDef> } | null = null;

/** Drop the memoised catalogue. Tests and the vendor's own writes call this. */
export function clearPlanCatalogCache(): void {
  cached = null;
}

const overrideSchema = z
  .object({
    priceAfn: z.number().int().min(0).max(10_000_000).optional(),
    employeeLimit: z.number().int().min(1).max(100_000).optional(),
    deviceLimit: z.number().int().min(1).max(100_000).optional(),
  })
  .strict();

export const planCatalogWriteSchema = z.object({
  plans: z.record(planIdSchema, overrideSchema),
});

export type PlanCatalogWrite = z.infer<typeof planCatalogWriteSchema>;

/**
 * The live catalogue: code defaults with the stored overrides merged over them.
 *
 * Only prices and caps are overridable. Which capability belongs to which tier
 * stays in code, because a feature set edited through a console is a feature
 * set nobody can review in a diff.
 */
export async function planCatalog(): Promise<Record<PlanId, PlanDef>> {
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.catalog;

  let stored: Record<string, unknown> = {};
  try {
    const snap = await db.doc(CATALOG_DOC).get();
    const data = snap.exists ? (snap.data() as { plans?: Record<string, unknown> }) : null;
    stored = data?.plans ?? {};
  } catch (e) {
    // A catalogue that cannot be read must not take the product down with it:
    // the defaults in code are always a usable price list.
    console.error("PLAN_CATALOG_READ_FAILED", { error: e });
  }

  const catalog = {} as Record<PlanId, PlanDef>;
  for (const id of PLAN_IDS) {
    const base = DEFAULT_PLANS[id];
    const parsed = overrideSchema.safeParse(stored[id] ?? {});
    catalog[id] = parsed.success ? { ...base, ...parsed.data } : { ...base };
  }

  cached = { at: Date.now(), catalog };
  return catalog;
}

export async function planDef(id: PlanId): Promise<PlanDef> {
  return (await planCatalog())[id];
}

/** Persist price and cap overrides, then drop the cache so the next read sees them. */
export async function setPlanCatalog(input: PlanCatalogWrite): Promise<Record<PlanId, PlanDef>> {
  await db.doc(CATALOG_DOC).set({ plans: input.plans }, { merge: true });
  clearPlanCatalogCache();
  return planCatalog();
}
