import { z } from "zod";
import { audit, db, nowTimestamp } from "../lib/firestore";

/**
 * Per-company configuration: which modules are turned on ("امکانات قابل ویرایش")
 * and the work policies that drive attendance/payroll. Stored on the company
 * document under `settings`; missing keys fall back to DEFAULT_SETTINGS so the
 * shape can grow without a migration.
 */
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

export const DEFAULT_SETTINGS: CompanySettings = {
  features: {
    shifts: true,
    leave: true,
    payroll: true,
    regularization: true,
    announcements: true,
    geofencing: true,
    qrKiosk: true,
    faceRecognition: false,
  },
  policies: {
    standardDailyMinutes: 480,
    weekendDays: [5],
    lateGraceMinutes: 10,
    overtimeEnabled: true,
  },
  profile: {
    currency: "AFN",
    timezone: "Asia/Kabul",
  },
};

/** PATCH body: every field optional so the client can send just what changed. */
export const settingsUpdateSchema = z.object({
  features: z
    .object({
      shifts: z.boolean(),
      leave: z.boolean(),
      payroll: z.boolean(),
      regularization: z.boolean(),
      announcements: z.boolean(),
      geofencing: z.boolean(),
      qrKiosk: z.boolean(),
      faceRecognition: z.boolean(),
    })
    .partial()
    .optional(),
  policies: z
    .object({
      standardDailyMinutes: z.number().int().min(60).max(1440),
      weekendDays: z.array(z.number().int().min(1).max(7)).max(7),
      lateGraceMinutes: z.number().int().min(0).max(120),
      overtimeEnabled: z.boolean(),
    })
    .partial()
    .optional(),
  profile: z
    .object({
      currency: z.string().length(3),
      timezone: z.string().min(1).max(64),
    })
    .partial()
    .optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/** Merges stored settings over the defaults so new keys always resolve. */
export function mergeSettings(stored: Partial<CompanySettings> | undefined): CompanySettings {
  return {
    features: { ...DEFAULT_SETTINGS.features, ...(stored?.features ?? {}) },
    policies: { ...DEFAULT_SETTINGS.policies, ...(stored?.policies ?? {}) },
    profile: { ...DEFAULT_SETTINGS.profile, ...(stored?.profile ?? {}) },
  };
}

export async function getSettings(cid: string): Promise<CompanySettings> {
  const snap = await db.collection("companies").doc(cid).get();
  const data = snap.data() as
    | { settings?: Partial<CompanySettings>; currency?: string; timezone?: string }
    | undefined;
  const merged = mergeSettings(data?.settings);
  // Fall back to the company doc's own currency/timezone if profile is unset.
  if (!data?.settings?.profile) {
    merged.profile = {
      currency: data?.currency ?? merged.profile.currency,
      timezone: data?.timezone ?? merged.profile.timezone,
    };
  }
  return merged;
}

export async function updateSettings(
  cid: string,
  patch: SettingsUpdate,
  actorId: string,
  roles: string[],
): Promise<CompanySettings> {
  const current = await getSettings(cid);
  const next: CompanySettings = {
    features: { ...current.features, ...(patch.features ?? {}) },
    policies: { ...current.policies, ...(patch.policies ?? {}) },
    profile: { ...current.profile, ...(patch.profile ?? {}) },
  };

  await db
    .collection("companies")
    .doc(cid)
    .set(
      {
        settings: next,
        // Keep the top-level mirror in sync for older readers.
        currency: next.profile.currency,
        timezone: next.profile.timezone,
        updatedAt: nowTimestamp(),
      },
      { merge: true },
    );

  await audit(cid, {
    actorId,
    actorRole: roles.join(","),
    action: "settings.update",
    resourceType: "settings",
    resourceId: cid,
    before: current,
    after: next,
  });

  return next;
}
