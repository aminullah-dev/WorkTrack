/**
 * Attendance is filed against the company's calendar day, not the viewer's.
 * A manager working from another country must still see the Kabul day their
 * staff actually worked, so "today" is always resolved in the company zone.
 */
export function isoTodayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, matching the server's day keys.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** True when the viewer's own clock disagrees with the company's calendar day. */
export function isViewerDayDifferent(timeZone: string): boolean {
  const local = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return local !== isoTodayIn(timeZone);
}
