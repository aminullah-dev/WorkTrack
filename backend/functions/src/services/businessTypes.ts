/**
 * What kind of business this is, and what that should assume on their behalf.
 *
 * A construction firm and a tailoring workshop need the same product set up
 * differently, and neither of them wants to learn what a geofence is on the
 * day they sign up. So signup asks one question it can answer well — what work
 * do you do — and turns the answer into sensible defaults.
 *
 * ---------------------------------------------------------------------------
 * THESE ARE PRESETS, NOT MODES. The distinction is the whole design.
 *
 * A preset is read once, at signup, and never again. Afterwards every setting
 * is exactly as editable as it was before, and the company is an ordinary
 * company. Nothing in the codebase branches on the type.
 *
 * The alternative — behaviour that keeps consulting the type — would turn one
 * product into fifteen. Fifteen types across nine feature switches is a matrix
 * nobody can test, where each bug reproduces for one kind of customer and
 * nobody else, and support cannot tell which. The type is kept on the company
 * for two honest reasons only: so it can be changed later (businesses change),
 * and so we can see what we are actually selling to.
 * ---------------------------------------------------------------------------
 */

export interface FeatureDefaults {
  shifts?: boolean;
  leave?: boolean;
  payroll?: boolean;
  regularization?: boolean;
  announcements?: boolean;
  geofencing?: boolean;
  qrKiosk?: boolean;
  faceRecognition?: boolean;
  finance?: boolean;
}

export interface PolicyDefaults {
  standardDailyMinutes?: number;
  weekendDays?: number[];
  lateGraceMinutes?: number;
  overtimeEnabled?: boolean;
}

export interface BusinessType {
  id: string;
  /** Only the differences from the product defaults, so the diff is readable. */
  features: FeatureDefaults;
  policies: PolicyDefaults;
  /**
   * Why this type differs, in one line. Not decoration: the next person to
   * change a default should have to disagree with a stated reason rather than
   * guess what the last one was thinking.
   */
  because: string;
  /**
   * Settings this type restates even though they already match the product
   * default — because for this kind of business the value must not follow the
   * default if the default ever moves.
   *
   * Repeating a default is normally a mistake: it silently pins the old value
   * for fifteen types the day somebody changes the product's mind. Sometimes
   * pinning is exactly what is wanted, and then it has to be said out loud
   * rather than looking like the mistake.
   */
  pins?: readonly (keyof FeatureDefaults)[];
}

/**
 * The product's own defaults, which every type starts from.
 * Mirrors DEFAULT_SETTINGS in settings.ts and the signup batch.
 */
export const BASE_FEATURES: Required<FeatureDefaults> = {
  shifts: true,
  leave: true,
  payroll: true,
  regularization: true,
  announcements: true,
  geofencing: true,
  qrKiosk: true,
  faceRecognition: false,
  finance: true,
};

export const BASE_POLICIES: Required<PolicyDefaults> = {
  standardDailyMinutes: 480,
  weekendDays: [5],
  lateGraceMinutes: 10,
  overtimeEnabled: true,
};

export const BUSINESS_TYPES: readonly BusinessType[] = [
  {
    id: "OFFICE",
    features: { geofencing: false, qrKiosk: false },
    policies: {},
    because: "An office knows where its staff are; a fence around a desk is noise.",
  },
  {
    id: "CONSTRUCTION",
    features: {},
    policies: { lateGraceMinutes: 20 },
    because:
      "Several sites, and a fence per site is the whole reason for buying this. " +
      "Arriving at a site is not arriving at a door, so the grace is wider.",
  },
  {
    id: "TAILORING",
    features: { geofencing: false, faceRecognition: false, qrKiosk: false },
    policies: {},
    pins: ["faceRecognition"],
    because:
      "One room, so a fence adds nothing. Face and photo check-in stay OFF and " +
      "this is the deliberate case: a workshop staffed by women may find a camera " +
      "at the door a reason not to buy the product at all, not a feature to enable. " +
      "It can still be switched on by a company that wants it.",
  },
  {
    id: "RETAIL",
    features: { geofencing: false },
    policies: { lateGraceMinutes: 5 },
    because:
      "A shop opens at a time and somebody has to be standing in it, so lateness " +
      "is measured tightly. One address, so no fence.",
  },
  {
    id: "WAREHOUSE",
    features: {},
    policies: {},
    because: "A gate, shifts, and drivers who are not staff. The defaults fit.",
  },
  {
    id: "SECURITY",
    features: {},
    policies: { standardDailyMinutes: 720 },
    because:
      "Twelve-hour shifts at fixed posts. A QR code at each post is how a guard " +
      "proves they were there, which is what the customer is buying.",
  },
  {
    id: "RESTAURANT",
    features: { geofencing: false },
    policies: { lateGraceMinutes: 5 },
    because: "Split shifts at one address; the kitchen cannot open late.",
  },
  {
    id: "CLINIC",
    features: { geofencing: false },
    policies: { lateGraceMinutes: 5 },
    because: "Night shifts and handovers, at one address. A shift that starts late has nobody covering it.",
  },
  {
    id: "SCHOOL",
    features: { geofencing: false, qrKiosk: false },
    policies: { standardDailyMinutes: 300 },
    because:
      "A teaching day is not an office day, and the thing that matters is whether " +
      "the class was taught, not whether somebody sat until five.",
  },
  {
    id: "NGO",
    features: {},
    policies: { weekendDays: [4, 5] },
    because:
      "Donor-funded work is reported per project, and most keep a Thursday-Friday " +
      "weekend. Timesheets here are a compliance obligation, not a convenience.",
  },
  {
    id: "EXCHANGE",
    features: { geofencing: false, qrKiosk: false },
    policies: { lateGraceMinutes: 5 },
    because: "Few people, one counter, and everything turns on who was present.",
  },
  {
    id: "TRANSPORT",
    features: { geofencing: false },
    policies: { lateGraceMinutes: 30 },
    because:
      "A driver is meant to be somewhere else, so a fence at the office would flag " +
      "every one of them, every day, for doing their job.",
  },
  {
    id: "PRODUCTION",
    features: {},
    policies: {},
    because: "Shift-based production against a count. The defaults fit.",
  },
  {
    id: "AGRICULTURE",
    features: { qrKiosk: false },
    policies: { lateGraceMinutes: 30 },
    because:
      "Seasonal labour hired by the day, often with no phone between them. Light " +
      "starts the day, not a clock.",
  },
  {
    id: "HOSPITALITY",
    features: { geofencing: false },
    policies: {},
    because: "Housekeeping and reception shifts at one address.",
  },
] as const;

export const BUSINESS_TYPE_IDS = BUSINESS_TYPES.map((t) => t.id);

export function findBusinessType(id: string | null | undefined): BusinessType | null {
  return BUSINESS_TYPES.find((t) => t.id === id) ?? null;
}

/**
 * The settings a company of this kind should start with.
 *
 * An unknown or missing type gives the product defaults rather than an error:
 * a company that signed up before this existed is not misconfigured, and a
 * signup must never fail over a dropdown.
 */
export function settingsForBusinessType(id: string | null | undefined): {
  features: Required<FeatureDefaults>;
  policies: Required<PolicyDefaults>;
} {
  const type = findBusinessType(id);
  return {
    features: { ...BASE_FEATURES, ...(type?.features ?? {}) },
    policies: { ...BASE_POLICIES, ...(type?.policies ?? {}) },
  };
}
