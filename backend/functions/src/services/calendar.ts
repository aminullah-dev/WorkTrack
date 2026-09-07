import { z } from "zod";
import { nowTimestamp, tenant } from "../lib/firestore";
import { shamsiMonthStartIso } from "../lib/shamsi";

/**
 * The working calendar: which dates a company actually expects people to work.
 *
 * Until this existed the system had no notion of an expected working day. An
 * attendanceDays document was written only when something *happened* — a punch,
 * an approved leave, a correction — so three very different situations were
 * indistinguishable, all of them simply "no document":
 *
 *   - Friday, when nobody is meant to be there
 *   - Eid, when nobody is meant to be there
 *   - an employee who never showed up
 *
 * Payroll counted only the documents it found, so the third case was paid in
 * full. And `policies.weekendDays`, which the settings screen lets a manager
 * choose, was never read by anything.
 *
 * Everything in the first half of this file is pure so the rules can be tested
 * without a database.
 */

export type DayKind = "WORKING" | "WEEKEND" | "HOLIDAY";

export interface Holiday {
  /** Observed Gregorian date, YYYY-MM-DD. */
  date: string;
  name: string;
  nameEn: string;
  /** Paid holidays cost the employee nothing; unpaid ones are simply closed. */
  paid: boolean;
  source: "SOLAR_RECURRING" | "MANUAL";
}

/** ISO weekday for a plain date: Monday = 1 … Sunday = 7. */
export function isoWeekday(dateIso: string): number {
  // Parsed as UTC on purpose: a plain date carries no timezone, and letting the
  // host's zone interpret it shifts the weekday for anyone west of UTC.
  const day = new Date(`${dateIso}T00:00:00Z`).getUTCDay(); // Sun=0 … Sat=6
  return ((day + 6) % 7) + 1;
}

/** Every date from `fromIso` to `toIso` inclusive. */
export function eachDate(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const end = new Date(`${toIso}T00:00:00Z`).getTime();
  for (
    let t = new Date(`${fromIso}T00:00:00Z`).getTime();
    t <= end;
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * What kind of day this is. A holiday that lands on a weekend stays a WEEKEND —
 * the distinction only matters for pay, and neither is worked.
 */
export function classifyDay(
  dateIso: string,
  weekendDays: number[],
  holidays: ReadonlySet<string>,
): DayKind {
  if (weekendDays.includes(isoWeekday(dateIso))) return "WEEKEND";
  if (holidays.has(dateIso)) return "HOLIDAY";
  return "WORKING";
}

/** The dates in [fromIso, toIso] on which people are actually expected in. */
export function expectedWorkingDays(
  fromIso: string,
  toIso: string,
  weekendDays: number[],
  holidays: ReadonlySet<string>,
): string[] {
  return eachDate(fromIso, toIso).filter(
    (d) => classifyDay(d, weekendDays, holidays) === "WORKING",
  );
}

// ------------------------------------------------------------ Afghan defaults

/**
 * Holidays fixed in the Solar Hijri calendar, so they can be generated for any
 * year. Deliberately short.
 *
 * The religious holidays — Eid al-Fitr, Eid al-Adha, Ashura, Mawlid — follow the
 * lunar calendar and in Afghanistan their observed dates are announced by moon
 * sighting, days ahead. They are NOT generated here, because a computed date
 * would be wrong often enough to dock somebody's pay for a day they were told
 * was a holiday. An administrator adds them for the year from the portal.
 *
 * Companies differ on which days they close; these are seeded as ordinary
 * editable entries, not as something the tenant is stuck with.
 */
export const SOLAR_HOLIDAYS: { month: number; day: number; name: string; nameEn: string }[] = [
  { month: 1, day: 1, name: "نوروز", nameEn: "Nawroz" },
  { month: 5, day: 28, name: "روز استقلال", nameEn: "Independence Day" },
];

/** Gregorian ISO date of a Solar Hijri year/month/day. */
export function shamsiDateToIso(year: number, month: number, day: number): string {
  const monthStart = shamsiMonthStartIso(year, month);
  const t = new Date(`${monthStart}T00:00:00Z`).getTime() + (day - 1) * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function solarHolidaysFor(shamsiYear: number): Holiday[] {
  return SOLAR_HOLIDAYS.map((h) => ({
    date: shamsiDateToIso(shamsiYear, h.month, h.day),
    name: h.name,
    nameEn: h.nameEn,
    paid: true,
    source: "SOLAR_RECURRING" as const,
  }));
}

// ----------------------------------------------------------------- storage

export const holidayWriteSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  name: z.string().min(1).max(80),
  nameEn: z.string().max(80).nullish(),
  paid: z.boolean().optional().default(true),
});

export async function listHolidays(cid: string, fromIso?: string, toIso?: string): Promise<Holiday[]> {
  const snap = await tenant(cid, "holidays").limit(1000).get();
  return snap.docs
    .map((d) => {
      const v = d.data() as Partial<Holiday>;
      return {
        date: v.date ?? d.id,
        name: v.name ?? "",
        nameEn: v.nameEn ?? "",
        paid: v.paid ?? true,
        source: v.source ?? "MANUAL",
      };
    })
    .filter((h) => (!fromIso || h.date >= fromIso) && (!toIso || h.date <= toIso))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Holiday dates in a range, as a set for the pure helpers above. */
export async function holidaySet(cid: string, fromIso: string, toIso: string): Promise<Set<string>> {
  return new Set((await listHolidays(cid, fromIso, toIso)).map((h) => h.date));
}

export async function saveHoliday(
  cid: string,
  input: z.infer<typeof holidayWriteSchema>,
): Promise<Holiday> {
  const holiday: Holiday = {
    date: input.date,
    name: input.name,
    nameEn: input.nameEn ?? "",
    paid: input.paid ?? true,
    source: "MANUAL",
  };
  // Keyed by date, so saving the same day twice corrects it instead of
  // creating a second entry that would be counted twice.
  await tenant(cid, "holidays").doc(input.date).set({ ...holiday, updatedAt: nowTimestamp() });
  return holiday;
}

export async function deleteHoliday(cid: string, dateIso: string): Promise<void> {
  await tenant(cid, "holidays").doc(dateIso).delete();
}

/**
 * Adds the generated solar holidays for a year, without touching anything an
 * administrator has already entered or removed for those dates.
 */
export async function seedSolarHolidays(cid: string, shamsiYear: number): Promise<number> {
  const col = tenant(cid, "holidays");
  const candidates = solarHolidaysFor(shamsiYear);
  let added = 0;
  for (const h of candidates) {
    const ref = col.doc(h.date);
    if ((await ref.get()).exists) continue;
    await ref.set({ ...h, updatedAt: nowTimestamp() });
    added += 1;
  }
  return added;
}
