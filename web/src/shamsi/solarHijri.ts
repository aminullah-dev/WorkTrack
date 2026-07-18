// Solar Hijri (هجری شمسی) <-> Gregorian conversion — the TypeScript port of the
// Android app's core:common/time/SolarHijri.kt (jalaali break-year algorithm).
// The business calendar of WorkTrack is Solar Hijri; storage/API stay ISO.

export interface ShamsiDate {
  year: number;
  month: number; // 1..12, 1 = Hamal/حمل
  day: number;
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
    leapJ += Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ += Math.floor(n / 33) * 8 + Math.floor(((n % 33) + 3) / 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;

  const leapG = Math.floor(gy / 4) - Math.floor((Math.floor(gy / 100) + 1) * 3 / 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    Math.floor((gy + Math.floor((gm - 8) / 6) + 100100) * 1461 / 4) +
    Math.floor((153 * ((gm + 9) % 12) + 2) / 5) +
    gd -
    34840408;
  d = d - Math.floor((Math.floor((gy + 100100 + Math.floor((gm - 8) / 6)) / 100) * 3) / 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j += Math.floor((Math.floor((4 * jdn + 183187720) / 146097) * 3) / 4) * 4 - 3908;
  const i = Math.floor((j % 1461) / 4) * 5 + 308;
  const gd = Math.floor((i % 153) / 5) + 1;
  const gm = (Math.floor(i / 153) % 12) + 1;
  const gy = Math.floor(j / 1461) - 100100 + Math.floor((8 - gm) / 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - Math.floor(jm / 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): ShamsiDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { year: jy, month: 1 + Math.floor(k / 31), day: (k % 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { year: jy, month: 7 + Math.floor(k / 30), day: (k % 30) + 1 };
}

/** Parses an ISO date (YYYY-MM-DD) into its Solar Hijri equivalent. */
export function toShamsi(isoDate: string): ShamsiDate {
  const [y, m, d] = isoDate.split("-").map((v) => Number.parseInt(v, 10));
  return d2j(g2d(y, m, d));
}

export function toShamsiFromDate(date: Date): ShamsiDate {
  return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

/** Solar Hijri date -> ISO date string (YYYY-MM-DD). */
export function shamsiToIso(date: ShamsiDate): string {
  const g = d2g(j2d(date.year, date.month, date.day));
  return `${g.gy.toString().padStart(4, "0")}-${g.gm
    .toString()
    .padStart(2, "0")}-${g.gd.toString().padStart(2, "0")}`;
}

export function isShamsiLeapYear(year: number): boolean {
  return jalCal(year).leap === 0;
}

export function shamsiMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isShamsiLeapYear(year) ? 30 : 29;
}

export function shamsiToday(): ShamsiDate {
  return toShamsiFromDate(new Date());
}
