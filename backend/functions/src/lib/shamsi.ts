/**
 * Solar Hijri (هجری شمسی) helpers for payroll periods. Payroll runs are keyed by
 * Shamsi year/month; this converts a Shamsi month to its Gregorian date range so
 * attendance (stored as ISO dates) can be queried for that period.
 *
 * Integer division MUST truncate toward zero (jalaali algorithm) — never floor.
 */

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
];

interface JalCal {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number): JalCal {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * ((gm + 9) % 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function iso(gy: number, gm: number, gd: number): string {
  return `${gy.toString().padStart(4, "0")}-${gm.toString().padStart(2, "0")}-${gd
    .toString()
    .padStart(2, "0")}`;
}

export function isShamsiLeapYear(year: number): boolean {
  return jalCal(year).leap === 0;
}

export function shamsiMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isShamsiLeapYear(year) ? 30 : 29;
}

/** ISO date of the 1st of a Shamsi month. */
export function shamsiMonthStartIso(year: number, month: number): string {
  const g = d2g(j2d(year, month, 1));
  return iso(g.gy, g.gm, g.gd);
}

/** ISO date of the last day of a Shamsi month. */
export function shamsiMonthEndIso(year: number, month: number): string {
  const g = d2g(j2d(year, month, shamsiMonthLength(year, month)));
  return iso(g.gy, g.gm, g.gd);
}

/** Current Shamsi (year, month) for defaulting a payroll period. */
export function currentShamsiMonth(): { year: number; month: number } {
  const now = new Date();
  const jdn = g2d(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let month: number;
  if (k >= 0) {
    if (k <= 185) {
      month = 1 + div(k, 31);
    } else {
      k -= 186;
      month = 7 + div(k, 30);
    }
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
    month = 7 + div(k, 30);
  }
  return { year: jy, month };
}
