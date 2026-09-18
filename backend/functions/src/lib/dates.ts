/**
 * Calendar-date arithmetic on YYYY-MM-DD strings.
 *
 * Dates a company sees — a licence expiry, a purge deadline, a leave span —
 * are days, not instants. Doing the arithmetic at UTC midnight keeps a day a
 * day: adding one to 2026-03-21 gives 2026-03-22 in Kabul as surely as in
 * Toronto, which a Date carrying a local time does not.
 */

/** Date `days` after `fromIso`, as YYYY-MM-DD. Negative goes back. */
export function addDays(fromIso: string, days: number): string {
  const t = new Date(`${fromIso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Date `months` after `fromIso`, clamped to the end of the target month.
 *
 * A term bought on the 31st runs to the 30th of a 30-day month, not into the
 * next one: a subscription that silently gains a day every other month is a
 * subscription whose expiry nobody can predict.
 */
export function addMonths(fromIso: string, months: number): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const firstOfTarget = new Date(Date.UTC(y, m - 1 + months, 1));
  const year = firstOfTarget.getUTCFullYear();
  const month = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}
